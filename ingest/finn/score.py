"""Rank filings by what matters to THIS investor (FR-04, FR-05, NFR-07).

    score = 100 x category weight x investor preference x position size
                x network relevance x price reaction x materiality (LLM read)

Each factor is stored with a plain-English reason, so the card can answer
"why am I seeing this?" without hand-waving.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

# Base weight: how often this kind of filing changes an investment case.
CATEGORY_WEIGHT = {
    "results": 0.85, "litigation": 0.85, "M&A": 0.8, "pledging": 0.8, "management_change": 0.75,
    "capex": 0.65, "fund_raise": 0.6, "insider_trading": 0.5, "credit_rating": 0.45,
    "press_release": 0.4, "bonus_split": 0.35, "dividend": 0.3, "earnings_call": 0.3,
    "agm_egm": 0.12, "postal_ballot": 0.1, "investor_meetings": 0.08, "unclassified": 0.04,
}
# Subtype overrides (multiplied with the category weight).
SUBTYPE_FACTOR = {
    ("results", "newspaper_ad"): 0.06, ("results", "intimation"): 0.2, ("results", "deck"): 0.45,
    ("earnings_call", "transcript"): 1.5, ("earnings_call", "recording"): 0.35, ("earnings_call", "notice"): 0.5,
    ("M&A", "subsidiary_admin"): 0.25, ("M&A", "agreement"): 0.8,
    ("credit_rating", "downgrade"): 1.8, ("credit_rating", "withdrawal"): 0.4,
}
SENIORITY_FACTOR = {"senior": 1.25, "board": 0.7, "other": 0.65}
MATERIALITY_FACTOR = {"high": 1.25, "medium": 1.0, "low": 0.4}

LABEL = {
    "results": "Results", "M&A": "M&A", "fund_raise": "Fund raise", "management_change": "Management change",
    "litigation": "Legal / regulatory", "insider_trading": "Insider trade", "earnings_call": "Earnings call",
    "investor_meetings": "Investor meeting", "credit_rating": "Credit rating", "dividend": "Dividend",
    "bonus_split": "Bonus / split", "capex": "Capex", "press_release": "Business update",
    "postal_ballot": "Postal ballot", "agm_egm": "AGM / EGM", "pledging": "Promoter pledge", "unclassified": "Routine",
}

TOP, NOTABLE = 66.0, 36.0
MARKET_CLOSE = (15, 30)


@dataclass
class Factor:
    name: str
    value: float
    reason: str


@dataclass
class Score:
    total: float
    tier: str                      # top | notable | routine
    factors: list[Factor] = field(default_factory=list)

    def why(self) -> list[str]:
        """Reasons worth showing: everything that moved the score away from neutral."""
        return [f.reason for f in self.factors if f.reason and abs(f.value - 1.0) > 0.04 or f.name == "category"]


# ------------------------------------------------------------------ price reaction


def reaction(filing: dict, bars: list[dict], lookback: int = 20) -> dict | None:
    """Price move and volume vs its average on the first session that could react to the filing."""
    if not bars or not filing.get("filed_at"):
        return None
    filed = datetime.fromisoformat(filing["filed_at"])
    day = filed.date()
    if (filed.hour, filed.minute) >= MARKET_CLOSE:
        day += timedelta(days=1)
    dates = [b["date"] for b in bars]
    idx = next((i for i, d in enumerate(dates) if d >= day.isoformat()), None)
    if idx is None or idx == 0:
        return None
    prev, cur = bars[idx - 1], bars[idx]
    window = bars[max(0, idx - lookback):idx]
    avg_vol = sum(b["volume"] for b in window) / len(window) if window else 0
    return {
        "date": cur["date"],
        "move_pct": round((cur["close"] / prev["close"] - 1) * 100, 1),
        "volume_x": round(cur["volume"] / avg_vol, 1) if avg_vol else None,
    }


# ------------------------------------------------------------------ score


def score(filing: dict, company: dict, prefs: dict, network_hint: dict | None, react: dict | None,
          materiality: dict | None) -> Score:
    cat, sub = filing["category"], filing.get("subtype", "")
    factors: list[Factor] = []

    w = CATEGORY_WEIGHT.get(cat, 0.04) * SUBTYPE_FACTOR.get((cat, sub), 1.0)
    reason = LABEL.get(cat, cat)
    if cat == "management_change" and filing.get("seniority"):
        w *= SENIORITY_FACTOR[filing["seniority"]]
        reason += {"senior": " at the top (CEO/MD/CFO level)", "board": " on the board", "other": " (senior staff)"}[filing["seniority"]]
    factors.append(Factor("category", round(w, 3), reason))

    boost = prefs.get("category_boost", {}).get(cat, 1.0)
    if cat in prefs.get("muted", []):
        boost = 0.3
    factors.append(Factor("preference", boost,
                          "You asked to see more of these" if boost > 1 else "You muted this type" if boost < 1 else ""))

    if company.get("in_portfolio"):
        pos = round(0.85 + company.get("weight", 0) * 0.03, 2)
        factors.append(Factor("position", pos, f"{company.get('weight', 0)}% of your portfolio"))
    else:
        factors.append(Factor("position", 0.75, "On your watchlist (not held)"))

    if network_hint:
        factors.append(Factor("network", 1.1, network_hint["reason"]))

    if react and react.get("move_pct") is not None:
        mv, vx = abs(react["move_pct"]), react.get("volume_x") or 0
        mult = 1.35 if mv >= 5 or vx >= 3 else 1.15 if mv >= 3 or vx >= 2 else 1.0
        if mult > 1:
            direction = "rose" if react["move_pct"] > 0 else "fell"
            factors.append(Factor("price", mult, f"Stock {direction} {mv:.1f}% on {vx:.1f}x usual volume that session"))

    if materiality and materiality.get("level") in MATERIALITY_FACTOR:
        m = MATERIALITY_FACTOR[materiality["level"]]
        factors.append(Factor("materiality", m, f"FINN read the filing: {materiality['level']} materiality, {materiality.get('reason', '')}".rstrip(", ")))

    p = 1.0
    for f in factors:
        p *= f.value
    # Monotone squash: keeps the order, stops strong items piling up at 100.
    # p=0.04 (routine) -> 7, p=0.3 -> 38, p=0.85 (plain results) -> 63, p=2 -> 80.
    total = round(100 * p / (p + 0.5), 1)
    tier = "routine" if cat in prefs.get("muted", []) else "top" if total >= TOP else "notable" if total >= NOTABLE else "routine"
    return Score(total, tier, factors)
