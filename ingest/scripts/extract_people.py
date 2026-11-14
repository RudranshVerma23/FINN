"""Extract people from management-change filings and attach network paths (FR-06).

Run from the repo root, after enrich_filings.py:
    python ingest/scripts/extract_people.py [--eval]
--eval compares the extraction with the hand-structured fixtures in ingest/tests/fixtures/.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.network import model, orgs  # noqa: E402
from finn.people import extract, with_paths  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"
FIXTURES = ROOT / "ingest" / "tests" / "fixtures" / "filing_people.json"


def evaluate(people_by_filing: dict[str, list[dict]]) -> None:
    """How close is the LLM's extraction to the hand-structured profiles? Org-level recall."""
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))["people"]
    print("\nExtraction vs fixtures (orgs recalled / orgs in fixture):")
    for fx in fixtures:
        extracted = [p for p in people_by_filing.get(fx["filing_id"], []) if p["name"].split()[-1] in fx["name"]]
        if not extracted:
            print(f"  {fx['name']:24} NOT FOUND in {fx['filing_id']}")
            continue
        got = {orgs.group(orgs.canonical(s["org"])) for s in extracted[0]["stints"]}
        want = {orgs.group(orgs.canonical(s["org"])) for s in fx["stints"]}
        hit = len(got & want)
        print(f"  {fx['name']:24} {hit}/{len(want)}  missing={sorted(want - got) or '-'}  extra={sorted(got - want) or '-'}")


def main(run_eval: bool) -> None:
    filings = json.loads((SNAP / "filings.json").read_text(encoding="utf-8"))
    meta = json.loads((SNAP / "meta.json").read_text(encoding="utf-8"))
    today = date.fromisoformat(meta["filings_to"])
    targets = [f for f in filings if f["category"] == "management_change" and f["tier"] != "routine"]
    print(f"Reading {len(targets)} management-change filings")

    extracted = extract(targets)
    net = model.load()
    by_story: dict[str, dict[str, dict]] = {}
    for f in targets:
        for p in extracted.get(f["id"], []):
            enriched = with_paths(p, net, today)
            enriched["source_filing"] = f["id"]
            story = by_story.setdefault(f["story_id"], {})
            key = p["name"].lower()
            # Keep the richest version of each person across a story's filings
            if key not in story or len(enriched["stints"]) > len(story[key]["stints"]):
                story[key] = enriched

    for f in filings:
        if f["id"] == f["story_id"] and f["id"] in by_story:
            f["people"] = sorted(by_story[f["id"]].values(), key=lambda p: p["change"] != "joins")
        elif "people" in f and f["id"] not in by_story:
            del f["people"]
    (SNAP / "filings.json").write_text(json.dumps(filings, indent=1, ensure_ascii=False), encoding="utf-8")

    print("\nPeople and paths:")
    for sid, people in by_story.items():
        lead = next(f for f in filings if f["id"] == sid)
        for p in people.values():
            best = p["paths"][0] if p["paths"] else None
            via = (best["via_name"] or "you") if best else "-"
            print(f"  {lead['symbol']:10} {p['change']:12} {p['name']:26} stints={len(p['stints'])} "
                  f"best path: {via} ({best['label'] if best else 'none'})")
    if run_eval:
        evaluate(extracted)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval", action="store_true")
    main(ap.parse_args().eval)
