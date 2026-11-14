"""The one place the batch pipeline talks to an LLM.

- Model routing comes from config/models.json (shared with the web app).
- Each tier is a fallback chain: on a quota / overload error we move to the next model.
- Every call is cached on disk by content hash, so re-running the pipeline is free.
- Every real call logs token usage to data/llm_usage.jsonl for the cost report.

Privacy rule (NFR-05): callers must only pass public documents (filings, transcripts).
Never pass network data about people.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "llm_cache"
USAGE_LOG = ROOT / "data" / "llm_usage.jsonl"
TIERS: dict[str, list[str]] = json.loads((ROOT / "config" / "models.json").read_text())["tiers"]

# 429 = quota, 500/503 = transient overload. Anything else is a real error.
_RETRYABLE = {429, 500, 503}

Tier = Literal["bulk", "reasoning"]

load_dotenv(ROOT / ".env")
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.")
        _client = genai.Client(api_key=key)
    return _client


def _cache_key(tier: str, system: str | None, schema: Any, prompt: str) -> str:
    # Keyed on the tier, not the model, so a fallback model's answer is reused next time.
    raw = json.dumps([tier, system, schema, prompt], sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def _log_usage(tier: str, model: str, response: types.GenerateContentResponse, label: str | None) -> None:
    usage = response.usage_metadata
    USAGE_LOG.parent.mkdir(parents=True, exist_ok=True)
    with USAGE_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps({
            "ts": time.time(),
            "tier": tier,
            "model": model,
            "label": label,
            "in": getattr(usage, "prompt_token_count", None),
            "out": getattr(usage, "candidates_token_count", None),
        }) + "\n")


def ask(
    prompt: str,
    tier: Tier = "bulk",
    *,
    system: str | None = None,
    schema: dict | None = None,
    label: str | None = None,
    use_cache: bool = True,
    max_attempts_per_model: int = 2,
) -> Any:
    """Run one prompt. Returns parsed JSON when `schema` is given, else text.

    `schema` is a JSON Schema dict; the model is forced to answer in that shape.
    `label` names the pipeline step in the usage log (e.g. "classify", "guidance").
    """
    key = _cache_key(tier, system, schema, prompt)
    cached = CACHE_DIR / f"{key}.json"
    if use_cache and cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))["output"]

    config = types.GenerateContentConfig(
        temperature=0,
        system_instruction=system,
        response_mime_type="application/json" if schema else "text/plain",
        response_json_schema=schema,
    )

    last_error: Exception | None = None
    for model in TIERS[tier]:
        for attempt in range(max_attempts_per_model):
            try:
                response = _get_client().models.generate_content(model=model, contents=prompt, config=config)
            except errors.APIError as e:
                last_error = e
                if e.code not in _RETRYABLE:
                    raise
                if e.code == 429:
                    break  # quota for this model is gone; try the next model straight away
                time.sleep(2 ** attempt * 3)
                continue

            if response.text is None:
                last_error = RuntimeError(f"{model} returned no text (blocked or empty)")
                break

            output = json.loads(response.text) if schema else response.text
            _log_usage(tier, model, response, label)
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps({"model": model, "output": output}), encoding="utf-8")
            return output

    raise RuntimeError(f"All models in tier '{tier}' failed") from last_error
