"""Smoke test: one tiny call per tier, to confirm the key and model IDs work.

Run from the repo root:  python ingest/scripts/smoke_llm.py
Uses 2 requests the first time; 0 after that (cached).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.llm import ask  # noqa: E402

SCHEMA = {
    "type": "object",
    "properties": {"category": {"type": "string"}},
    "required": ["category"],
}

print("bulk:", ask(
    "Classify this NSE filing title into one category word: "
    "'Appointment of Mr. A. Sharma as Chief Financial Officer'",
    "bulk", schema=SCHEMA, label="smoke",
))
print("reasoning:", ask("Reply with exactly: ok", "reasoning", label="smoke"))
