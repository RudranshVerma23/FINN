"""Build data/snapshot/results.json: the latest quarter's headline numbers per company (FR-07).

Run from the repo root (after build_snapshot.py):
    python ingest/scripts/build_results.py
No LLM calls: numbers come from the exchange XBRL and are checked against Screener.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.results import build  # noqa: E402
from finn.sources import screener  # noqa: E402
from finn.sources.http import FetchError  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"


def main() -> None:
    index = json.loads((SNAP / "results_index.json").read_text(encoding="utf-8"))
    out = {}
    for sym, rows in index.items():
        try:
            table = screener.company(sym)["tables"].get("quarters")
        except FetchError:
            table = None
        r = build(sym, rows, table)
        if not r:
            print(f"  {sym:11} no XBRL for the latest quarter")
            continue
        out[sym] = r
        flags = " ".join(("✓" if c["ok"] else "✗") + c["name"].split()[0] for c in r["checks"])
        vals = "  ".join(f"{l['label'][:7]}={l['value']}({l['yoy_pct']}%)" for l in r["lines"])
        print(f"  {sym:11} {r['quarter']} {r['basis'][:4]} {r['kind']:9} {vals}  [{flags}]"
              + (f" missing={r['missing']}" if r["missing"] else ""))
    (SNAP / "results.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    bad = [(s, c) for s, r in out.items() for c in r["checks"] if not c["ok"]]
    print(f"\n{len(out)} companies; {sum(len(r['checks']) for r in out.values())} checks, {len(bad)} failed")
    for s, c in bad:
        print(f"  ✗ {s}: {c['name']} ({c['detail']})")


if __name__ == "__main__":
    main()
