"""Quarterly results card: Revenue, EBITDA, PBT, PAT with QoQ and YoY (FR-07, NFR-06).

Numbers come from the exchange XBRL, never from an LLM. Every card carries its checks:
  - arithmetic: PBT - tax = profit for the period
  - cross-source: revenue / PBT / net profit vs Screener's table (compiled from the same filings)
Lenders get the lines that mean something for a lender (EBITDA does not).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .sources.http import FetchError
from .xbrl import Facts, read

CRORE = 1e7


@dataclass
class Line:
    key: str
    label: str
    tags: tuple[str, ...]  # first tag present wins


def _get(v: dict[str, float], *tags: str) -> float | None:
    for t in tags:
        if t in v:
            return v[t]
    return None


def kind_of(v: dict[str, float]) -> str:
    if "OperatingProfitBeforeProvisionAndContingencies" in v or ("InterestExpended" in v and "RevenueFromOperations" not in v):
        return "bank"
    if "InterestEarned" in v:
        return "nbfc"
    return "corporate"


def headline_numbers(f: Facts) -> dict[str, float | None]:
    """Revenue, EBITDA (or its lender equivalent), PBT, PAT in rupees for one quarter."""
    v = f.values
    k = kind_of(v)
    if k == "bank":
        earned, expended = _get(v, "InterestEarned"), _get(v, "InterestExpended")
        return {
            "revenue": earned - expended if earned is not None and expended is not None else None,  # net interest income
            "ebitda": _get(v, "OperatingProfitBeforeProvisionAndContingencies"),
            "pbt": _get(v, "ProfitLossFromOrdinaryActivitiesBeforeTax", "ProfitBeforeTax"),
            "pat": _get(v, "ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates", "ProfitLossForThePeriod",
                        "ProfitLossForPeriod"),
            "tax": _get(v, "TaxExpense"),
            "profit_total": _get(v, "ProfitLossFromOrdinaryActivitiesAfterTax", "ProfitLossForThePeriod"),
            "share_assoc": _get(v, "ShareOfProfitLossOfAssociates"),
            "discontinued": None,
            "interest_earned": earned,
        }
    pbt = _get(v, "ProfitBeforeTax")
    ebitda = None
    if k == "corporate":
        base = _get(v, "ProfitBeforeExceptionalItemsAndTax", "ProfitBeforeTax")
        fin, da, oth = _get(v, "FinanceCosts"), _get(v, "DepreciationDepletionAndAmortisationExpense"), _get(v, "OtherIncome")
        if base is not None and fin is not None and da is not None:
            ebitda = base + fin + da - (oth or 0)
    return {
        "revenue": _get(v, "RevenueFromOperations"),
        "ebitda": ebitda,
        "pbt": pbt,
        "pat": _get(v, "ProfitOrLossAttributableToOwnersOfParent", "ProfitLossForPeriod"),
        "tax": _get(v, "TaxExpense"),
        "profit_total": _get(v, "ProfitLossForPeriod"),
        "share_assoc": _get(v, "ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod"),
        "discontinued": _get(v, "ProfitLossFromDiscontinuedOperationsAfterTax"),
        # Power utilities book regulatory deferral movements between PBT and profit (Ind AS 114)
        "reg_deferral": _get(v, "NetMovementInRegulatoryDeferralAccountBalancesRelatedToProfitOrLossAndTheRelatedDeferredTaxMovement"),
        "interest_earned": None,
    }


LABELS = {
    "corporate": {"revenue": "Revenue", "ebitda": "EBITDA", "pbt": "PBT", "pat": "PAT"},
    "nbfc": {"revenue": "Revenue", "ebitda": "EBITDA", "pbt": "PBT", "pat": "PAT"},
    "bank": {"revenue": "Net interest income", "ebitda": "Pre-provision profit", "pbt": "PBT", "pat": "PAT"},
}
NOTES = {
    "corporate": "EBITDA = PBT before exceptional items + finance costs + depreciation − other income.",
    "nbfc": "EBITDA isn't meaningful for a lender: interest is its cost of goods.",
    "bank": "For a bank, pre-provision operating profit stands in for EBITDA.",
}


def quarter_label(quarter_end: str) -> str:
    d = date.fromisoformat(quarter_end)
    fy = d.year + 1 if d.month > 3 else d.year
    q = {6: 1, 9: 2, 12: 3, 3: 4}[d.month]
    return f"Q{q} FY{str(fy)[2:]}"


def _shift(quarter_end: str, months: int) -> str:
    d = date.fromisoformat(quarter_end)
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    last = {1: 31, 2: 29 if y % 4 == 0 else 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}[m]
    return date(y, m, last).isoformat()


def _pick(index: list[dict], quarter_end: str, consolidated: bool) -> dict | None:
    rows = [r for r in index if r["quarter_end"] == quarter_end and r["consolidated"] == consolidated and r.get("xbrl_url")]
    return max(rows, key=lambda r: r["filed_at"] or "") if rows else None


def _pct(cur: float | None, base: float | None) -> float | None:
    if cur is None or base is None or base == 0:
        return None
    if base < 0:  # growth off a loss is not a percentage anyone should read
        return None
    return round((cur / base - 1) * 100, 1)


def _screener_value(table: dict | None, label_options: tuple[str, ...], quarter_end: str) -> float | None:
    """Screener quarterly value in crore for the column matching quarter_end ('Sep 2026')."""
    if not table:
        return None
    col = date.fromisoformat(quarter_end).strftime("%b %Y")
    if col not in table["periods"]:
        return None
    i = table["periods"].index(col)
    for lab in label_options:
        row = table["rows"].get(lab)
        if row and i < len(row) and row[i] is not None:
            return row[i]
    return None


def build(symbol: str, index: list[dict], screener_quarters: dict | None) -> dict | None:
    if not index:
        return None
    latest_q = max(r["quarter_end"] for r in index if r.get("quarter_end"))
    consolidated = _pick(index, latest_q, True) is not None
    quarters = {"cur": latest_q, "prev": _shift(latest_q, -3), "yoy": _shift(latest_q, -12)}

    facts: dict[str, Facts | None] = {}
    sources: dict[str, dict] = {}
    for key, q in quarters.items():
        row = _pick(index, q, consolidated) or _pick(index, q, not consolidated)
        if not row:
            facts[key] = None
            continue
        try:
            facts[key] = read(row["xbrl_url"], q)
        except (FetchError, Exception):
            facts[key] = None
        sources[key] = row
    if not facts.get("cur"):
        return None

    kind = kind_of(facts["cur"].values)
    nums = {k: headline_numbers(f) if f else {} for k, f in facts.items()}
    lines = []
    for key in ("revenue", "ebitda", "pbt", "pat"):
        cur = nums["cur"].get(key)
        prev = nums["prev"].get(key) if nums["prev"] else None
        yoy = nums["yoy"].get(key) if nums["yoy"] else None
        lines.append({
            "key": key,
            "label": LABELS[kind][key],
            "value": round(cur / CRORE, 1) if cur is not None else None,
            "prev": round(prev / CRORE, 1) if prev is not None else None,
            "year_ago": round(yoy / CRORE, 1) if yoy is not None else None,
            "qoq_pct": _pct(cur, prev),
            "yoy_pct": _pct(cur, yoy),
        })

    margin = None
    rev, ebitda = nums["cur"].get("revenue"), nums["cur"].get("ebitda")
    if kind == "corporate" and rev and ebitda is not None:
        def m(n):
            return round(n["ebitda"] / n["revenue"] * 100, 1) if n and n.get("revenue") and n.get("ebitda") is not None else None
        margin = {"label": "EBITDA margin", "value": m(nums["cur"]), "prev": m(nums["prev"]), "year_ago": m(nums["yoy"])}

    # ---- checks (NFR-06)
    checks = []
    c = nums["cur"]
    share = c.get("share_assoc") or 0.0
    disc = c.get("discontinued") or 0.0
    reg = c.get("reg_deferral") or 0.0
    if c.get("pbt") is not None and c.get("tax") is not None and c.get("profit_total") is not None:
        # Profit for the period = PBT - tax (+ share of JV/associates when reported below PBT)
        #                         + discontinued ops + regulatory deferral movement
        base = c["pbt"] - c["tax"] + disc + reg
        candidates = [("", base), (" + JV/associate share", base + share)] if share else [("", base)]
        diffs = [(abs(x - c["profit_total"]) / max(1.0, abs(c["profit_total"])), how) for how, x in candidates]
        diff, how = min(diffs)
        checks.append({"name": "PBT − tax = profit", "ok": diff < 0.02,
                       "detail": f"off by {diff * 100:.1f}%" + (f" (after adding{how[2:]})" if how else "")})

    def screener_check(name: str, ours_options: list[tuple[str, float | None]], labels: tuple[str, ...], tol: float):
        theirs = _screener_value(screener_quarters, labels, quarters["cur"])
        opts = [(how, v) for how, v in ours_options if v is not None]
        if theirs is None or theirs == 0 or not opts:
            return
        diff, how, v = min((abs(v / CRORE - theirs) / abs(theirs), how, v) for how, v in opts)
        checks.append({"name": f"{name} vs Screener", "ok": diff < tol,
                       "detail": f"₹{v / CRORE:,.0f} cr{how} vs ₹{theirs:,.0f} cr"})

    if kind == "bank":
        screener_check("Interest earned", [("", c.get("interest_earned"))], ("Revenue",), 0.03)
    else:
        screener_check("Revenue", [("", c.get("revenue"))], ("Sales", "Revenue"), 0.05)
    pbt = c.get("pbt")
    screener_check("PBT", [("", pbt),
                           (" incl. JV share", pbt + share if pbt is not None and share else None),
                           (" incl. JV share and regulatory deferral", pbt + share + reg if pbt is not None and reg else None)],
                   ("Profit before tax",), 0.03)
    screener_check("Net profit", [("", c.get("profit_total")), ("", c.get("pat"))], ("Net Profit",), 0.05)

    # Material share of JV/associate profit sits outside PBT: say so on the card.
    jv_note = None
    if share and c.get("pbt") and abs(share) / abs(c["pbt"]) >= 0.1:
        jv_note = f"Share of JV/associate profit of ₹{share / CRORE:,.0f} cr is reported separately from PBT."

    cur_src = sources.get("cur", {})
    rev_line, pat_line = lines[0], lines[3]

    def phrase(line):
        if line["yoy_pct"] is not None:
            return f"{line['label']} {line['yoy_pct']:+.0f}% YoY"
        if line["value"] is not None and line["year_ago"] is not None and line["year_ago"] < 0 <= line["value"]:
            return f"{line['label']} turns positive"
        return None

    parts = [p for p in (phrase(rev_line), phrase(pat_line)) if p]
    return {
        "symbol": symbol,
        "quarter_end": quarters["cur"],
        "quarter": quarter_label(quarters["cur"]),
        "basis": "consolidated" if consolidated else "standalone",
        "kind": kind,
        "filed_at": cur_src.get("filed_at"),
        "source_url": cur_src.get("ixbrl_url") or cur_src.get("xbrl_url"),
        "lines": lines,
        "margin": margin,
        "note": NOTES[kind],
        "jv_note": jv_note,
        "checks": checks,
        "headline": f"{quarter_label(quarters['cur'])}: " + ", ".join(parts) if parts else None,
        "missing": [k for k, f in facts.items() if f is None],
    }
