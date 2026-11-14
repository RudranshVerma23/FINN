"""Classify, read, score and group the snapshot's filings in place (FR-03..FR-05).

Run from the repo root (after build_snapshot.py and build_network.py):
    python ingest/scripts/enrich_filings.py [--no-llm]
LLM calls are cached, so re-running costs nothing unless filings changed.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.enrich import enrich, enriched_at  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"


def load(name: str):
    path = SNAP / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def main(use_llm: bool) -> None:
    filings = load("filings.json")
    prefs = json.loads((ROOT / "config" / "preferences.json").read_text(encoding="utf-8"))
    out = enrich(filings, load("companies.json"), load("prices.json"), prefs, load("network.json"), use_llm=use_llm)
    (SNAP / "filings.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")

    meta = load("meta.json")
    meta["enriched_at"] = enriched_at()
    meta["tiers"] = dict(Counter(f["tier"] for f in out))
    (SNAP / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")

    leads = [f for f in out if f["story_id"] == f["id"]]
    print(f"\n{len(out)} filings -> {len(leads)} stories; tiers {meta['tiers']}")
    print("\nTop 15 stories:")
    for f in sorted(leads, key=lambda x: x["score"], reverse=True)[:15]:
        print(f"  {f['score']:5.1f} {f['tier']:8} {f['symbol']:10} {f['category_label']:18} "
              f"{f.get('headline') or f['title']}")
        print(f"        why: {' · '.join(f['why'])}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-llm", action="store_true")
    main(not ap.parse_args().no_llm)
