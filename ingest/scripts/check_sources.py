"""Check every source adapter against one or more NSE symbols and print a compact report.

Run from the repo root:
    python ingest/scripts/check_sources.py RELIANCE KAYNES
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.sources import nse, prices, screener  # noqa: E402
from finn.sources.http import FetchError  # noqa: E402


def check(symbol: str) -> None:
    print(f"\n=== {symbol} ===")
    today = date.today()

    try:
        anns = nse.announcements(symbol, today - timedelta(days=14), today)
        cats = sorted({a["exchange_category"] for a in anns})
        print(f"NSE announcements (14d): {len(anns)}  categories: {cats[:6]}")
        if anns:
            a = anns[0]
            print(f"  latest: {a['filed_at']}  {a['exchange_category']}  {a['text'][:90]!r}")
    except FetchError as e:
        print("NSE announcements: FAILED", e)

    try:
        res = nse.results_index(symbol)
        latest = res[0] if res else None
        print(f"NSE results index: {len(res)} filings"
              + (f"  quarters: {sorted({r['quarter_end'] for r in res}, reverse=True)[:5]}"
                 f"  latest xbrl={'yes' if latest['xbrl_url'] else 'no'}" if latest else ""))
    except FetchError as e:
        print("NSE results index: FAILED", e)

    bars = prices.eod_bars([symbol], period="1mo").get(symbol, [])
    print(f"Yahoo EOD bars (1mo): {len(bars)}" + (f"  last: {bars[-1]}" if bars else ""))

    try:
        c = screener.company(symbol)
        q = c["tables"]["quarters"]
        print(f"Screener: {c['name']} ({c['view']}, BSE {c['bse_code']})  quarters: {q['periods'][-4:] if q else None}")
        if q:
            for row in ("Sales", "Revenue", "Net Profit", "Profit before tax"):
                if row in q["rows"]:
                    print(f"  {row}: {q['rows'][row][-4:]}")
        d = c["documents"]
        print(f"  annual reports: {[r['year'] for r in d['annual_reports']][:4]}")
        print(f"  concalls with transcript: {[x['month'] for x in d['concalls'] if x['transcript_url']][:4]}")
    except FetchError as e:
        print("Screener: FAILED", e)


if __name__ == "__main__":
    for s in sys.argv[1:] or ["RELIANCE"]:
        check(s)
