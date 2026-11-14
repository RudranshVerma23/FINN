"""Build the data snapshot the web app reads (FR-01, FR-02, NFR-01).

Fetches, for every portfolio and watchlist company:
  - exchange announcements for the last `--days` days     -> filings.json
  - end-of-day bars for the last 6 months                  -> prices.json
  - the quarterly-results filing index (XBRL links)        -> results_index.json
and writes companies.json + meta.json alongside.

Later tasks enrich this snapshot in place (classification, scores, network links).
If a source fails for one company, that company keeps whatever the previous snapshot had,
so a flaky exchange never wipes good data.

Run from the repo root:
    python ingest/scripts/build_snapshot.py [--days 30]
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.sources import nse, prices  # noqa: E402
from finn.sources.http import FetchError  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"


def load(name: str, default):
    path = SNAP / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(name: str, data) -> None:
    SNAP.mkdir(parents=True, exist_ok=True)
    (SNAP / name).write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def main(days: int) -> None:
    cfg = json.loads((ROOT / "config" / "portfolio.json").read_text(encoding="utf-8"))
    holdings = {h["symbol"]: h for h in cfg["holdings"]}
    watch = {w["symbol"]: w for w in cfg["watchlist"]}
    symbols = list(holdings) + list(watch)

    end = date.today()
    start = end - timedelta(days=days)

    old_filings = {f["id"]: f for f in load("filings.json", [])}
    old_results = load("results_index.json", {})
    filings: dict[str, dict] = {}
    results: dict[str, list] = {}
    companies: dict[str, dict] = load("companies.json", {})
    failures: list[str] = []

    for sym in symbols:
        try:
            anns = nse.announcements(sym, start, end)
        except FetchError as e:
            failures.append(f"{sym}: announcements ({e})")
            anns = [f for f in old_filings.values() if f["symbol"] == sym]
        for a in anns:
            filings[a["id"]] = a

        try:
            results[sym] = nse.results_index(sym)
        except FetchError as e:
            failures.append(f"{sym}: results index ({e})")
            results[sym] = old_results.get(sym, [])

        meta = holdings.get(sym) or watch[sym]
        first = anns[0] if anns else {}
        prev = companies.get(sym, {})
        companies[sym] = {
            "symbol": sym,
            "name": first.get("company") or prev.get("name") or sym,
            "isin": first.get("isin") or prev.get("isin"),
            "industry": first.get("industry") or prev.get("industry"),
            "sector": meta["sector"],
            "cap": meta.get("cap"),
            "in_portfolio": sym in holdings,
            "weight": meta.get("weight", 0),
        }
        print(f"  {sym:12} filings={len(anns):3}  results={len(results[sym]):2}")

    bars = prices.eod_bars(symbols, period="6mo")
    old_prices = load("prices.json", {})
    for sym in symbols:
        if not bars.get(sym):
            failures.append(f"{sym}: prices")
            bars[sym] = old_prices.get(sym, [])

    filing_list = sorted(filings.values(), key=lambda f: f["filed_at"] or "", reverse=True)
    last_trading_day = max((b[-1]["date"] for b in bars.values() if b), default=None)

    save("companies.json", companies)
    save("filings.json", filing_list)
    save("prices.json", bars)
    save("results_index.json", results)
    save("meta.json", {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "filings_from": start.isoformat(),
        "filings_to": end.isoformat(),
        "latest_filing_at": filing_list[0]["filed_at"] if filing_list else None,
        "last_trading_day": last_trading_day,
        "counts": {
            "companies": len(companies),
            "filings": len(filing_list),
            "price_bars": sum(len(b) for b in bars.values()),
        },
        "sources": ["NSE corporate announcements", "NSE integrated filing (financials)", "Yahoo Finance EOD"],
        "failures": failures,
    })
    print(f"\nSnapshot: {len(companies)} companies, {len(filing_list)} filings, last trading day {last_trading_day}")
    if failures:
        print("Failures (kept previous data):", *failures, sep="\n  ")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=30)
    main(p.parse_args().days)
