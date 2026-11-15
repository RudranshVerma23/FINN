"""Attach "best person to explain this" to material event stories (FR-08).

Run from the repo root, after enrich_filings.py:
    python ingest/scripts/event_contacts.py
Writes `event_contacts` onto M&A, capex, litigation and fund-raise story leads in filings.json.
"""

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.network import model  # noqa: E402
from finn.network.event import best_for_event  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"
EVENTS = {"M&A", "capex", "litigation", "fund_raise"}


def main() -> None:
    filings = json.loads((SNAP / "filings.json").read_text(encoding="utf-8"))
    companies = json.loads((SNAP / "companies.json").read_text(encoding="utf-8"))
    today = date.fromisoformat(json.loads((SNAP / "meta.json").read_text(encoding="utf-8"))["filings_to"])
    net = model.load()

    n = 0
    for f in filings:
        f.pop("event_contacts", None)
        if f["id"] != f["story_id"] or f["category"] not in EVENTS or f["tier"] == "routine":
            continue
        best = best_for_event(f, companies.get(f["symbol"], {}).get("sector", ""), net, today)
        if best:
            f["event_contacts"] = [b.to_dict() for b in best]
            n += 1
            b = best[0]
            print(f"  {f['symbol']:10} {f['category']:10} {(f.get('headline') or f['title'])[:46]:46} -> {b.name:16} "
                  f"({b.relation or 'expertise'}, {b.score}) | {' · '.join(b.why[:2])}")
    (SNAP / "filings.json").write_text(json.dumps(filings, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{n} event stories now name the best person to ask")


if __name__ == "__main__":
    main()
