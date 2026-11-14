"""NSE adapter: corporate announcements and the financial-results index.

Why NSE and not BSE: during the T01 spike, BSE's JSON API returned 403 (Akamai)
to scripted clients, while NSE's API answered normally. If NSE starts blocking
too, the committed snapshot keeps the app working (NFR-01).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from .http import HOUR, FetchError, client

BASE = "https://www.nseindia.com"
IST = timezone(timedelta(hours=5, minutes=30))
_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": f"{BASE}/companies-listing/corporate-filings-announcements",
}


def _api(path: str, params: dict, ttl: float) -> list | dict:
    try:
        return client.get_json(f"{BASE}{path}", params=params, headers=_HEADERS, ttl=ttl)
    except FetchError:
        # NSE sometimes wants session cookies; warm up once and retry.
        try:
            client.get_text(BASE, headers={"Accept": "text/html"})
        except FetchError:
            pass
        return client.get_json(f"{BASE}{path}", params=params, headers=_HEADERS, ttl=ttl)


def _ist(ts: str | None, fmt: str = "%d-%b-%Y %H:%M:%S") -> str | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts.strip(), fmt).replace(tzinfo=IST).isoformat()
    except ValueError:
        return None


def announcements(symbol: str, start: date, end: date, ttl: float = 6 * HOUR) -> list[dict]:
    """All announcements filed by `symbol` between `start` and `end` (inclusive), newest first."""
    raw = _api(
        "/api/corporate-announcements",
        {
            "index": "equities",
            "symbol": symbol.upper(),
            "from_date": start.strftime("%d-%m-%Y"),
            "to_date": end.strftime("%d-%m-%Y"),
        },
        ttl,
    )
    out = []
    for r in raw or []:
        out.append({
            "id": f"NSE-{r.get('seq_id')}",
            "source": "NSE",
            "symbol": r.get("symbol"),
            "isin": r.get("sm_isin"),
            "company": r.get("sm_name"),
            "industry": r.get("smIndustry"),
            "filed_at": _ist(r.get("an_dt")),
            "exchange_category": (r.get("desc") or "").strip(),
            "text": (r.get("attchmntText") or "").strip(),
            "exchange_summary": (r.get("voiceSummary") or "").strip() or None,
            "attachment_url": r.get("attchmntFile"),
            "attachment_size": r.get("attFileSize") or r.get("fileSize"),
            "has_xbrl": bool(r.get("hasXbrl")),
        })
    out.sort(key=lambda f: f["filed_at"] or "", reverse=True)
    return out


def results_index(symbol: str, ttl: float = 12 * HOUR) -> list[dict]:
    """Index of quarterly results filings, each with a link to its XBRL file (structured numbers).

    Since 2025, listed companies file results as SEBI "Integrated Filing - Financials".
    NSE's older `corporates-financial-results` endpoint stops at Dec 2024, so we use the
    integrated-filing endpoint. In the XBRL, context `OneD` is the quarter itself.
    """
    raw = _api(
        "/api/integrated-filing-results",
        {"index": "equities", "symbol": symbol.upper(), "type": "Integrated Filing- Financials"},
        ttl,
    )
    rows = raw.get("data", []) if isinstance(raw, dict) else raw or []
    out = []
    for r in rows:
        quarter_end = r.get("qe_Date")
        out.append({
            "id": f"NSE-IF-{r.get('seq_Id')}",
            "symbol": r.get("symbol"),
            "quarter_end": datetime.strptime(quarter_end, "%d-%b-%Y").date().isoformat() if quarter_end else None,
            "consolidated": (r.get("consolidated") or "").lower() == "consolidated",
            "audited": (r.get("audited") or "").lower() == "audited",
            "revision": r.get("type_Sub"),
            "filed_at": _ist(r.get("broadcast_Date")),
            "xbrl_url": r.get("xbrl"),
            "ixbrl_url": r.get("ixbrl"),
        })
    out.sort(key=lambda x: (x["quarter_end"] or "", x["filed_at"] or ""), reverse=True)
    return out
