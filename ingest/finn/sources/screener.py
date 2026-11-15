"""Screener.in adapter: standardised financial tables and links to primary documents.

What FINN takes from Screener:
  - the *tables* (quarterly results, P&L, balance sheet, cash flow, ratios), which
    Screener compiles from the company's own filings; and
  - the *links* to annual reports and concall transcripts (hosted on BSE / company sites).

What FINN does NOT take: Screener's own commentary, "about" text, pros/cons or AI
summaries. The Pull side must stay grounded in primary documents (FR-16).
"""

from __future__ import annotations

import re
from datetime import datetime

from bs4 import BeautifulSoup

from .http import DAY, FetchError, client

BASE = "https://www.screener.in"
_TABLE_SECTIONS = {
    "quarters": "quarters",
    "profit_loss": "profit-loss",
    "balance_sheet": "balance-sheet",
    "cash_flow": "cash-flow",
    "ratios": "ratios",
}


def _num(text: str) -> float | None:
    t = text.replace(",", "").replace("%", "").replace("+", "").strip()
    if t in ("", "-", "--"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _parse_table(section) -> dict | None:
    table = section.find("table") if section else None
    if not table:
        return None
    periods = [th.get_text(strip=True) for th in table.select("thead th")][1:]
    rows: dict[str, list[float | None]] = {}
    for tr in table.select("tbody tr"):
        cells = tr.find_all("td")
        if not cells:
            continue
        label = re.sub(r"\s*\+$", "", cells[0].get_text(" ", strip=True)).strip()
        if label.startswith("CFO/EBITDA"):  # the label cell also carries a tooltip sentence
            label = "CFO/EBITDA"
        if not label or label.lower().startswith("raw pdf"):
            continue
        rows[label] = [_num(td.get_text(strip=True)) for td in cells[1:]]
    return {"periods": periods, "rows": rows}


def _parse_documents(soup) -> dict:
    docs = soup.find("section", id="documents")
    annual_reports, concalls = [], []
    if not docs:
        return {"annual_reports": annual_reports, "concalls": concalls}
    for block in docs.select("div.documents"):
        heading = (block.find("h3").get_text(strip=True) if block.find("h3") else "").lower()
        if heading.startswith("annual report"):
            for a in block.select("li a"):
                m = re.search(r"(\d{4})", a.get_text())
                annual_reports.append({"year": int(m.group(1)) if m else None, "url": a.get("href")})
        elif heading.startswith("concall"):
            for li in block.select("li"):
                m = re.search(r"\b([A-Z][a-z]{2} \d{4})\b", li.get_text(" ", strip=True))
                try:
                    month = datetime.strptime(m.group(1), "%b %Y").strftime("%Y-%m") if m else None
                except ValueError:
                    month = None
                links = {a.get_text(strip=True).lower(): a.get("href") for a in li.find_all("a") if a.get("href")}
                concalls.append({
                    "month": month,
                    "transcript_url": links.get("transcript"),
                    "presentation_url": links.get("ppt"),
                    "recording_url": links.get("rec"),
                })
    return {"annual_reports": annual_reports, "concalls": concalls}


def _top_ratios(soup) -> dict[str, str]:
    """Market data shown at the top of the page (market cap, price, P/E, ROCE...). Raw strings."""
    out = {}
    for li in soup.select("#top-ratios li"):
        name, value = li.select_one(".name"), li.select_one(".value")
        if name and value:
            out[name.get_text(" ", strip=True)] = re.sub(r"\s+", " ", value.get_text(" ", strip=True))
    return out


def _bse_code(soup) -> str | None:
    for a in soup.select("a[href*='bseindia.com/stock-share-price']"):
        m = re.search(r"/(\d{6})/", a.get("href", ""))
        if m:
            return m.group(1)
    return None


def company(symbol: str, consolidated: bool = True, ttl: float = DAY) -> dict:
    """Financial tables and document links for an NSE symbol.

    Tries the consolidated view first; falls back to standalone when the company
    doesn't report consolidated numbers (Screener then shows an empty table).
    """
    symbol = symbol.upper()
    views = ["consolidated/", ""] if consolidated else [""]
    last_error: Exception | None = None
    for view in views:
        url = f"{BASE}/company/{symbol}/{view}"
        try:
            html = client.get_text(url, headers={"Accept": "text/html"}, ttl=ttl)
        except FetchError as e:
            last_error = e
            continue
        soup = BeautifulSoup(html, "html.parser")
        tables = {key: _parse_table(soup.find("section", id=sid)) for key, sid in _TABLE_SECTIONS.items()}
        quarters, annual = tables.get("quarters"), tables.get("profit_loss")
        if view and (not quarters or not quarters["rows"] or not annual or not annual["periods"]):
            continue  # no (or too short a) consolidated history; use standalone
        name = soup.find("h1")
        return {
            "symbol": symbol,
            "name": name.get_text(strip=True) if name else symbol,
            "bse_code": _bse_code(soup),
            "view": "consolidated" if view else "standalone",
            "source_url": url,
            "top_ratios": _top_ratios(soup),
            "tables": tables,
            "documents": _parse_documents(soup),
        }
    raise FetchError(f"Screener has no page for {symbol}") from last_error


def search(query: str, ttl: float = DAY) -> list[dict]:
    """Resolve a company name or partial ticker to Screener entries (FR-11)."""
    rows = client.get_json(f"{BASE}/api/company/search/", params={"q": query}, ttl=ttl)
    out = []
    for r in rows or []:
        m = re.match(r"^/company/([^/]+)/", r.get("url", ""))
        if m:
            out.append({"name": r.get("name"), "symbol": m.group(1)})
    return out
