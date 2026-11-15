"""Export Screener fundamentals for every portfolio/watchlist company to data/snapshot/fundamentals.json.

The web app's Pull view reads this for known tickers (instant, works even if Screener is
unreachable from the host: NFR-01) and fetches any other ticker live (NFR-02).

Run from the repo root:
    python ingest/scripts/build_fundamentals.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.sources import screener  # noqa: E402
from finn.sources.http import FetchError  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"


def main() -> None:
    cfg = json.loads((ROOT / "config" / "portfolio.json").read_text(encoding="utf-8"))
    symbols = [h["symbol"] for h in cfg["holdings"]] + [w["symbol"] for w in cfg["watchlist"]]
    out = {}
    for sym in symbols:
        try:
            out[sym] = screener.company(sym)
        except FetchError as e:
            print(f"  {sym}: failed ({e})")
            continue
        c = out[sym]
        periods = (c["tables"].get("profit_loss") or {}).get("periods") or ["-"]
        print(f"  {sym:11} {c['view'][:4]} P&L {periods[0]}..{periods[-1]} "
              f"ARs={len(c['documents']['annual_reports'])} concalls={len(c['documents']['concalls'])}")
    (SNAP / "fundamentals.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(out)} companies -> fundamentals.json ({(SNAP / 'fundamentals.json').stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
