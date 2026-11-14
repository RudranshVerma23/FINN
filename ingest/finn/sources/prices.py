"""End-of-day price and volume via Yahoo Finance (yfinance).

Note: Yahoo's `Adj Close` for some NSE tickers was inconsistent with `Close` during
the T01 spike (e.g. 2472 vs 1333 on the same day), so FINN uses the raw `Close`.
Day-over-day moves and volume ratios don't need dividend adjustment for alerts.
"""

from __future__ import annotations

import math

import yfinance as yf


def yahoo_symbol(symbol: str, exchange: str = "NS") -> str:
    return f"{symbol.upper()}.{exchange}"


def eod_bars(symbols: list[str], period: str = "6mo") -> dict[str, list[dict]]:
    """Daily bars per NSE symbol: {symbol: [{date, open, high, low, close, volume}, ...]} oldest first.

    Symbols Yahoo doesn't know come back as an empty list rather than raising.
    """
    if not symbols:
        return {}
    tickers = [yahoo_symbol(s) for s in symbols]
    df = yf.download(
        tickers, period=period, interval="1d", progress=False,
        auto_adjust=False, group_by="ticker", threads=True,
    )
    out: dict[str, list[dict]] = {}
    for sym, tick in zip(symbols, tickers):
        # group_by="ticker" gives (ticker, field) columns, even for a single ticker.
        if df.empty or tick not in df.columns.get_level_values(0):
            out[sym] = []
            continue
        frame = df[tick]
        bars = []
        for idx, row in frame.iterrows():
            close, vol = row.get("Close"), row.get("Volume")
            if close is None or (isinstance(close, float) and math.isnan(close)):
                continue
            bars.append({
                "date": idx.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(close), 2),
                "volume": int(vol) if vol == vol else 0,  # NaN check
            })
        out[sym] = bars
    return out
