"""Scan a broad universe of NSE names to choose a demo portfolio with real, recent events.

The brief asks for a portfolio "that makes for an interesting demo". Rather than guess,
we pull the last N days of filings and EOD data for ~75 liquid names across sectors and
rank them by how many *material* events they had (management changes, M&A, results,
litigation, capex, credit rating) plus unusual price/volume moves.

Run from the repo root:
    python ingest/scripts/scan_universe.py [days]
Writes data/raw/universe_scan.json (gitignored) and prints a ranked table.
"""

import json
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.sources import nse, prices  # noqa: E402
from finn.sources.http import FetchError  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

UNIVERSE = {
    "Energy & conglomerates": ["RELIANCE", "ADANIENT", "ONGC", "NTPC", "POWERGRID", "TATAPOWER", "SUZLON", "COALINDIA"],
    "Banks & financials": ["HDFCBANK", "ICICIBANK", "KOTAKBANK", "AXISBANK", "SBIN", "AUBANK", "IDFCFIRSTB",
                           "BAJFINANCE", "CHOLAFIN", "MUTHOOTFIN", "CDSL", "BSE", "ANGELONE"],
    "IT & tech": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "PERSISTENT", "TATAELXSI", "ETERNAL"],
    "Electronics & capital goods": ["KAYNES", "DIXON", "POLYCAB", "LT", "HAL", "BEL", "MAZDOCK", "SIEMENS", "ABB"],
    "Chemicals": ["DEEPAKNTR", "PIIND", "SRF", "AARTIIND", "NAVINFLUOR", "PIDILITIND"],
    "Pharma & health": ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "LUPIN", "APOLLOHOSP", "MAXHEALTH"],
    "Consumer": ["ITC", "HINDUNILVR", "NESTLEIND", "TITAN", "TRENT", "DMART", "PAGEIND", "VBL", "JUBLFOOD", "ASIANPAINT"],
    "Auto": ["MARUTI", "M&M", "TMPV", "BAJAJ-AUTO", "EICHERMOT", "HEROMOTOCO", "TVSMOTOR"],
    "Metals, cement, infra, realty": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "ULTRACEMCO", "ADANIPORTS", "DLF",
                                      "GODREJPROP", "LODHA", "INDIGO", "IRCTC"],
}

# Substrings of NSE's own category labels that signal a material event.
MATERIAL = {
    "management": ["change in management", "change in director", "key managerial", "cessation", "appointment"],
    "m&a": ["acquisition", "amalgamation", "merger", "scheme of arrangement", "joint venture", "restructuring"],
    "results": ["financial result", "outcome of board meeting"],
    "litigation": ["action(s) taken", "litigation", "dispute", "insolvency"],
    "capex": ["capacity", "expansion", "capex"],
    "rating": ["credit rating"],
    "fund_raise": ["allotment", "qip", "rights issue", "buyback", "preferential"],
}


def tags_for(category: str) -> list[str]:
    c = category.lower()
    return [tag for tag, keys in MATERIAL.items() if any(k in c for k in keys)]


def main(days: int = 14) -> None:
    end = date.today()
    start = end - timedelta(days=days)
    symbols = [s for group in UNIVERSE.values() for s in group]
    sector = {s: g for g, group in UNIVERSE.items() for s in group}

    bars = prices.eod_bars(symbols, period="3mo")
    rows = []
    for sym in symbols:
        try:
            anns = nse.announcements(sym, start, end)
        except FetchError as e:
            print(f"  {sym}: announcements failed ({e})")
            anns = []
        tags = Counter(t for a in anns for t in tags_for(a["exchange_category"]))

        b = bars.get(sym, [])
        vol_ratio = move = None
        if len(b) > 21:
            avg20 = sum(x["volume"] for x in b[-21:-1]) / 20
            peak = max(b[-days:], key=lambda x: x["volume"] / avg20 if avg20 else 0)
            vol_ratio = round(peak["volume"] / avg20, 2) if avg20 else None
            moves = [abs(b[i]["close"] / b[i - 1]["close"] - 1) * 100 for i in range(len(b) - days, len(b))]
            move = round(max(moves), 1)

        score = (3 * tags["management"] + 3 * tags["m&a"] + 2 * tags["litigation"] + 2 * tags["capex"]
                 + 1 * tags["results"] + 1 * tags["rating"] + 1 * tags["fund_raise"]
                 + (2 if vol_ratio and vol_ratio >= 2 else 0) + (1 if move and move >= 4 else 0))
        rows.append({
            "symbol": sym, "sector": sector[sym], "filings": len(anns), "tags": dict(tags),
            "max_vol_ratio": vol_ratio, "max_abs_move_pct": move, "score": score,
            "has_prices": bool(b),
            "management_headlines": [a["text"][:140] for a in anns if "management" in tags_for(a["exchange_category"])][:3],
        })

    rows.sort(key=lambda r: r["score"], reverse=True)
    out = ROOT / "data" / "raw" / "universe_scan.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"start": str(start), "end": str(end), "rows": rows}, indent=1), encoding="utf-8")

    print(f"\n{'symbol':12} {'sector':28} {'n':>3} {'score':>5} {'vol×':>5} {'move%':>6}  tags")
    for r in rows:
        print(f"{r['symbol']:12} {r['sector'][:28]:28} {r['filings']:>3} {r['score']:>5} "
              f"{r['max_vol_ratio'] or '-':>5} {r['max_abs_move_pct'] or '-':>6}  {r['tags']}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 14)
