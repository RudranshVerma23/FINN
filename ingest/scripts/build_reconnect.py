"""Write data/snapshot/reconnect.json: dormant contacts with a natural reason to call (FR-23).

Run from the repo root, after enrich_filings.py and build_results.py:
    python ingest/scripts/build_reconnect.py [--days 14]
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.network import model  # noqa: E402
from finn.network.reconnect import reasons_to_reconnect  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"


def main(days: int) -> None:
    meta = json.loads((SNAP / "meta.json").read_text(encoding="utf-8"))
    today = date.fromisoformat(meta["filings_to"])
    since = (datetime.fromisoformat(meta["generated_at"]) - timedelta(days=days)).isoformat()
    filings = json.loads((SNAP / "filings.json").read_text(encoding="utf-8"))
    companies = json.loads((SNAP / "companies.json").read_text(encoding="utf-8"))
    results = json.loads((SNAP / "results.json").read_text(encoding="utf-8"))
    links = json.loads((ROOT / "config" / "company_links.json").read_text(encoding="utf-8"))["links"]

    stories = []
    for f in filings:
        if f["id"] != f["story_id"] or f["tier"] == "routine" or f["filed_at"] < since:
            continue
        if f["category"] in {"earnings_call", "investor_meetings", "agm_egm", "postal_ballot", "unclassified"}:
            continue  # "a transcript was posted" is not a reason to call anyone
        r = results.get(f["symbol"])
        if f["category"] == "results" and r and r.get("headline"):
            f = {**f, "results_headline": r["headline"]}  # computed numbers beat the filing's cover-letter title
        stories.append(f)

    out = reasons_to_reconnect(model.load(), stories, companies, links, today)
    (SNAP / "reconnect.json").write_text(json.dumps([r.to_dict() for r in out], indent=1, ensure_ascii=False), encoding="utf-8")
    for r in out:
        print(f"  {r.name:18} last spoke {r.last_spoke or 'never':10} {r.relation:10} {r.org[:26]:26} -> "
              f"{r.symbol:9} {r.headline[:60]}  ({r.score})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    main(ap.parse_args().days)
