"""Canonical organisations, so 'Tata Power Delhi Distribution Ltd' and 'TPDDL' are one org."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz, process

ROOT = Path(__file__).resolve().parents[3]
_LEGAL = re.compile(r"\b(limited|ltd|pvt|private|plc|inc|llp|co|company|corporation|enterprise)\b\.?")


def _norm(name: str) -> str:
    s = re.sub(r"\([^)]*\)", " ", name.lower()).replace("&", " and ")  # "Dixon Technologies (India)"
    s = re.sub(r"[^\w\s]", " ", s)
    s = _LEGAL.sub(" ", s)
    s = re.sub(r"^the\s+", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


@lru_cache(maxsize=1)
def _registry() -> tuple[dict, dict]:
    data = json.loads((ROOT / "config" / "orgs.json").read_text(encoding="utf-8"))["orgs"]
    by_id = {o["id"]: o for o in data}
    index: dict[str, str] = {}
    for o in data:
        for alias in [o["name"], *o.get("aliases", [])]:
            index[_norm(alias)] = o["id"]
    return by_id, index


def canonical(name: str | None) -> str | None:
    """Org id for a free-text org name. Unknown orgs get a stable `x-<slug>` id."""
    if not name or name.strip().lower() in {"independent", "self-employed", "freelance"}:
        return None
    by_id, index = _registry()
    key = _norm(name)
    if key in index:
        return index[key]
    hit = process.extractOne(key, index.keys(), scorer=fuzz.ratio, score_cutoff=92)
    if hit:
        return index[hit[0]]
    return "x-" + re.sub(r"\s+", "-", key)


def info(org_id: str | None) -> dict:
    by_id, _ = _registry()
    if org_id in by_id:
        return by_id[org_id]
    return {"id": org_id, "name": (org_id or "").removeprefix("x-").replace("-", " ").title()}


def name(org_id: str | None) -> str:
    return info(org_id)["name"]


def group(org_id: str | None) -> str | None:
    """Top-level group id: a subsidiary maps to its parent."""
    seen = set()
    while org_id and org_id not in seen:
        seen.add(org_id)
        parent = info(org_id).get("parent")
        if not parent:
            return org_id
        org_id = parent
    return org_id


def for_symbol(symbol: str) -> str | None:
    by_id, _ = _registry()
    for o in by_id.values():
        if o.get("symbol") == symbol:
            return o["id"]
    return None
