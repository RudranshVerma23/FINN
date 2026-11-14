"""Classify exchange filings into the reference categories (FR-03).

Order of evidence, cheapest first:
  1. text rules on the filing's own description (most specific: "...appointment of CFO...")
  2. NSE's category label for the filing
  3. leftovers (generic labels like "General Updates" with no rule hit) go to the bulk LLM
     in batches; see enrich.py.

Every result records which rule fired, so a wrong label is easy to trace and fix.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

CATEGORIES = [
    "results", "M&A", "fund_raise", "management_change", "litigation", "insider_trading",
    "earnings_call", "investor_meetings", "credit_rating", "dividend", "bonus_split", "capex",
    "press_release", "postal_ballot", "agm_egm", "pledging", "unclassified",
]

# (category, subtype, pattern on the lower-cased text). First match wins, so order matters:
# narrow routine patterns go before broad material ones ("ESOP allotment" before "allotment").
_TEXT_RULES: list[tuple[str, str, str]] = [
    ("unclassified", "esop", r"\besop|\besos|\besps|stock option|restricted stock|\brsus?\b|ads-rsu|employees?\W+stock option trust|grant of options"),
    ("unclassified", "allotment", r"^(?!.*(preferential|qip|qualified institution|rights|warrant|non-?convertible)).*allotment of [\d,]+\s+(equity )?shares"),
    ("results", "intimation", r"(board meeting|meeting of the board).{0,120}(to consider|inter alia).{0,80}results|intimation of board meeting"),
    ("M&A", "subsidiary_admin", r"strike off|section 8 |under section 8|incorporation of .{0,40}(wholly owned )?subsidiary"),
    ("unclassified", "admin", r"dematerial|registrar|\brta\b|change in (the )?(corporate )?office address|address of the|trading window|"
                              r"loss of share|duplicate share|investor complaint|\bbrsr\b|monitoring agency|statement of deviation|"
                              r"compliance certificate|certificate under|reg(ulation)?\.? ?74|special window|re-?lodgement"),
    ("results", "newspaper_ad", r"newspaper.*result|result.*newspaper"),
    ("unclassified", "newspaper", r"newspaper"),
    ("earnings_call", "transcript", r"\btranscript"),
    ("earnings_call", "recording", r"recording|audio (link|recording)|link of (the )?(audio|recording)"),
    ("earnings_call", "notice", r"earnings call|con(ference)?\.? ?call|analyst call|investor call"),
    ("investor_meetings", "meet", r"schedule of (analyst|investor|institutional)?\s*meet|investors?'? meet|investor conference|"
                                  r"participat\w* in .{0,60}(meeting|conference|summit|forum)|one-on-one|non-deal roadshow"),
    ("pledging", "pledge", r"pledg|encumbr"),
    ("insider_trading", "disclosure", r"insider trading|regulation 7\s*\(2\)|sast|substantial acquisition of shares"),
    ("litigation", "media_clarification", r"clarification on media|non-?compliance|show cause|penalt|\bfine\b|tax demand|"
                                          r"insolvency|\bnclt\b|\bcirp\b|arbitra|litigation|lawsuit|order passed|orders passed|"
                                          r"action\(s\) taken|regulatory action|search and seizure"),
    ("credit_rating", "rating", r"credit rating|rating (action|reaffirm|upgrade|downgrade)|reaffirm\w* .{0,40}rating|\bcrisil\b|\bicra\b|care ratings|india ratings"),
    ("management_change", "change", r"appoint|cessation|resign|retire|superannuat|change in (management|director)|"
                                    r"key managerial|senior management|\bkmp\b|\bsmp\b|whole-?time director|chief (executive|financial|operating)"),
    ("M&A", "deal", r"acqui|amalgamation|merger|demerger|joint venture|term sheet|scheme of arrangement|"
                    r"divest|sale or disposal|stake (sale|purchase)|incorporation of .{0,40}subsidiary|investment in .{0,40}subsidiary"),
    ("fund_raise", "raise", r"\bqip\b|qualified institution|preferential|rights issue|buy-?back|commercial paper|"
                            r"non-?convertible|\bncd|debenture|fund rais|issue of securities|allotment of .{0,30}(shares|securities|warrants)"),
    ("bonus_split", "corporate_action", r"\bbonus\b|sub-?division|stock split|split of"),
    ("dividend", "dividend", r"dividend|record date"),
    ("capex", "capex", r"capacity|capex|capital expenditure|expansion|greenfield|brownfield|new (plant|facility)|commission(ed|ing)"),
    ("postal_ballot", "ballot", r"postal ballot"),
    ("agm_egm", "meeting", r"\bagm\b|\begm\b|general meeting|e-?voting|scrutini[sz]er"),
    ("results", "filing", r"financial results?|unaudited .{0,40}results|audited .{0,40}results|results for the (quarter|period|year)"),
    ("results", "deck", r"investor presentation|results presentation|earnings presentation"),
    ("press_release", "business_update", r"successful bidder|order (win|received|worth)|bags|wins .{0,30}(order|contract)|contract|"
                                         r"launch|partnership|production,? sales|sales (and|&) export|monthly business update|press release"),
]

_EXCHANGE_MAP: dict[str, tuple[str, str]] = {
    "appointment": ("management_change", "change"),
    "change in management": ("management_change", "change"),
    "change in director(s)": ("management_change", "change"),
    "retirement": ("management_change", "change"),
    "cessation": ("management_change", "change"),
    "resignation": ("management_change", "change"),
    "resignation of director/kmp/smp": ("management_change", "change"),
    "acquisition": ("M&A", "deal"),
    "amalgamation/merger": ("M&A", "deal"),
    "scheme of arrangement": ("M&A", "deal"),
    "sale or disposal": ("M&A", "deal"),
    "other restructuring": ("M&A", "deal"),
    "agreements": ("M&A", "agreement"),
    "credit rating": ("credit_rating", "rating"),
    "credit rating- others": ("credit_rating", "rating"),
    "dividend": ("dividend", "dividend"),
    "record date": ("dividend", "record_date"),
    "esop/esos/esps": ("unclassified", "esop"),
    "allotment of securities": ("fund_raise", "raise"),
    "issue of securities": ("fund_raise", "raise"),
    "shareholders meeting": ("agm_egm", "meeting"),
    "capacity addition": ("capex", "capex"),
    "investor presentation": ("results", "deck"),
    "outcome of board meeting": ("results", "board_outcome"),
    "financial result updates": ("results", "filing"),
    "corporate insolvency resolution process": ("litigation", "insolvency"),
    "action(s) taken or orders passed": ("litigation", "order"),
    "copy of newspaper publication": ("unclassified", "newspaper"),
    "analysts/institutional investor meet/con. call updates": ("investor_meetings", "meet"),
    "trading window": ("unclassified", "admin"),
    "monitoring agency report": ("unclassified", "admin"),
    "statement of deviation(s) or variation(s) under reg. 32": ("unclassified", "admin"),
    "committee meeting updates": ("unclassified", "admin"),
    "related party transactions": ("unclassified", "rpt"),
    "monthly business updates": ("press_release", "business_update"),
    "certificate under sebi (depositories and participants) regulations, 2018": ("unclassified", "admin"),
}

# Labels too generic to trust on their own: if no text rule fires, ask the LLM.
GENERIC_LABELS = {"general updates", "updates", "press release", ""}

_SENIOR = re.compile(r"\b(ceo|cfo|coo|managing director|chief executive|chief financial|chief operating|chairman|chairperson|"
                     r"whole-?time director|executive director|(?<!vice )president)\b")
_BOARD = re.compile(r"\b(independent director|nonexecutive|nominee director|director)\b")


@dataclass
class Classification:
    category: str | None      # None = needs the LLM
    subtype: str
    rule: str                 # which rule decided, for traceability
    seniority: str | None = None  # management_change only: senior | board | other


def _seniority(text: str) -> str:
    text = re.sub(r"non\s*-\s*executive", "nonexecutive", text)  # "Non- Executive Director" is a board seat
    if _SENIOR.search(text):
        return "senior"
    if _BOARD.search(text):
        return "board"
    return "other"


def classify(filing: dict) -> Classification:
    text = (filing.get("text") or "").lower()
    label = (filing.get("exchange_category") or "").strip().lower()

    for category, subtype, pattern in _TEXT_RULES:
        if re.search(pattern, text):
            c = Classification(category, subtype, f"text:{subtype}")
            break
    else:
        if label in _EXCHANGE_MAP:
            category, subtype = _EXCHANGE_MAP[label]
            c = Classification(category, subtype, f"exchange:{label}")
        elif label in GENERIC_LABELS:
            return Classification(None, "", "needs_llm")
        else:
            return Classification(None, "", f"needs_llm:unknown label '{label}'")

    if c.category == "management_change":
        c.seniority = _seniority(text)
        if re.search(r"re-?\s?appoint|continuation of|extension of (the )?term", text):
            c.subtype = "reappointment"  # continuity, not change
    elif c.category == "credit_rating":
        c.subtype = "downgrade" if "downgrad" in text else "withdrawal" if "withdraw" in text else c.subtype
    return c
