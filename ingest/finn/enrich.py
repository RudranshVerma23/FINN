"""Turn raw filings into a ranked brief (FR-03, FR-04, FR-05).

Pipeline:
  1. classify every filing with rules (classify.py)
  2. pick the filings worth reading: rule leftovers + every potentially material filing
  3. read them in batches with the bulk model: category (for leftovers), a specific headline,
     a one-line summary and a materiality judgement, from the filing text + PDF excerpt only
  4. score with explainable factors (score.py), assign tiers
  5. group filings about the same event into one story ("3 filings, 1 story")

Routine filings never reach the LLM: they get a rule-made title and stay collapsed.
"""

from __future__ import annotations

import html
import re
from collections import defaultdict
from datetime import datetime

from . import llm
from .classify import CATEGORIES, classify
from .documents import excerpt
from .score import LABEL, reaction, score

# Categories whose filings are worth an LLM read (if not a routine subtype).
READ = {"results", "M&A", "fund_raise", "management_change", "litigation", "insider_trading", "credit_rating",
        "capex", "pledging", "press_release", "bonus_split", "dividend"}
SKIP_SUBTYPES = {"newspaper_ad", "intimation", "allotment", "esop", "admin", "newspaper", "recording", "deck"}
BATCH = 10

SYSTEM = """You triage Indian stock-exchange filings for a busy portfolio investor.
Use ONLY the filing text you are given. Never add outside knowledge about the company.
For each filing return:
- category: one of {cats}
- headline: at most 10 words, specific and plain (names, roles, amounts, dates). No company name prefix, no hype words.
- summary: one sentence, at most 28 words: what changed, with the concrete figure, name or date from the text.
  If the text has no substance (e.g. just "General Updates"), say plainly what kind of document it is.
- materiality: "high" if it could move the stock or change the investment case; "medium" if worth knowing;
  "low" if procedural. Give a reason of at most 10 words that cites a FACT from this filing
  (a number, name, role or date). Generic reasons such as "results impact valuation" or
  "leadership changes are important" are forbidden. If the filing is only a cover letter with
  no facts, say "cover letter only; figures are in the attachment" and use "medium".
  Judge size against the company: each filing says whether it is a large or mid cap. A deal, order or
  investment that is tiny for that company (a few lakh rupees or thousand dollars, a CSR entity, a
  dormant subsidiary) is "low" whatever its category.
Category guide: results=quarterly/annual results, board meetings approving them, results decks; M&A=acquisition, merger,
demerger, JV, subsidiary investment or stake sale; fund_raise=QIP, rights, preferential, buyback, debt raising;
management_change=CEO/CFO/MD/director/senior management joining or leaving; litigation=lawsuits, regulatory orders,
fines, inspections with observations, insolvency; capex=new plant or capacity; press_release=order wins, launches,
partnerships, other news; unclassified=routine paperwork."""

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "headline": {"type": "string"},
                    "summary": {"type": "string"},
                    "materiality": {"type": "string", "enum": ["high", "medium", "low"]},
                    "materiality_reason": {"type": "string"},
                },
                "required": ["id", "category", "headline", "summary", "materiality", "materiality_reason"],
            },
        }
    },
    "required": ["items"],
}

_PREFIX = re.compile(r"^.{0,90}?\b(has|have)\s+(informed|submitted to)\s+the\s+exchange,?\s*(regarding|about|that|the)?\s*", re.I)


def rule_title(filing: dict) -> str:
    """'Wipro Limited has informed the Exchange regarding 'Grant of RSUs'.' -> 'Grant of RSUs'"""
    t = _PREFIX.sub("", html.unescape(filing.get("text") or "")).strip().strip("'\".").strip()
    t = re.sub(r"\s+", " ", t)
    if not t or t.lower() in {"general updates", "updates"}:
        t = filing.get("exchange_category") or "Filing"
    t = t[0].upper() + t[1:]
    return t if len(t) <= 90 else t[:87].rsplit(" ", 1)[0] + "…"


def _read_batch(batch: list[dict], companies: dict) -> dict[str, dict]:
    blocks = []
    for f in batch:
        body = excerpt(f.get("attachment_url") or "")
        cap = companies.get(f["symbol"], {}).get("cap") or "large"
        blocks.append(
            f"### id: {f['id']}\ncompany: {f['company']} ({cap} cap)\nexchange label: {f['exchange_category']}\n"
            f"filing text: {f['text'][:600]}\npdf excerpt: {body or '(not available)'}\n"
        )
    out = llm.ask(
        "Filings:\n\n" + "\n".join(blocks),
        "bulk",
        system=SYSTEM.format(cats=", ".join(CATEGORIES)),
        schema=SCHEMA,
        label="enrich_filings",
    )
    return {item["id"]: item for item in out.get("items", [])}


def _story_key(f: dict) -> tuple:
    day = f["filed_at"][:10]
    return (f["symbol"], f["category"], day)


def enrich(filings: list[dict], companies: dict, prices: dict, prefs: dict, network: dict | None,
           use_llm: bool = True, log=print) -> list[dict]:
    # 1. rules
    for f in filings:
        c = classify(f)
        f.update(category=c.category, subtype=c.subtype, rule=c.rule, seniority=c.seniority)
        f["title"] = rule_title(f)

    # 2-3. LLM read, batched
    to_read = [f for f in filings if f["category"] is None or (f["category"] in READ and f["subtype"] not in SKIP_SUBTYPES)]
    log(f"  rules classified {sum(f['category'] is not None for f in filings)}/{len(filings)}; "
        f"reading {len(to_read)} with the bulk model in {-(-len(to_read) // BATCH)} calls")
    if use_llm:
        for i in range(0, len(to_read), BATCH):
            batch = to_read[i:i + BATCH]
            try:
                results = _read_batch(batch, companies)
            except Exception as e:  # keep the pipeline alive; these filings fall back to rules
                log(f"  batch {i // BATCH + 1} failed: {e}")
                continue
            for f in batch:
                r = results.get(f["id"])
                if not r:
                    continue
                if f["category"] is None:
                    f["category"], f["subtype"], f["rule"] = r["category"], "llm", "llm"
                    if r["category"] == "management_change":
                        from .classify import _seniority
                        f["seniority"] = _seniority((r["headline"] + " " + r["summary"]).lower())
                f["headline"], f["summary"] = r["headline"].strip(), r["summary"].strip()
                f["materiality"] = {"level": r["materiality"], "reason": r["materiality_reason"].strip()}
    for f in filings:
        if f["category"] is None:
            f["category"], f["subtype"], f["rule"] = "unclassified", "fallback", "fallback"

    # 4. score
    who = (network or {}).get("who_to_call", {})
    for f in filings:
        company = companies.get(f["symbol"], {})
        top = (who.get(f["symbol"]) or [None])[0]
        hint = None
        if top and top["score"] >= 0.3:
            hint = {"reason": f"You know people here: {top['name']} ({top['relation']}, {top['org']})"}
        react = reaction(f, prices.get(f["symbol"], []))
        s = score(f, company, prefs, hint, react, f.get("materiality"))
        f["reaction"] = react
        f["score"] = s.total
        f["tier"] = s.tier
        f["why"] = s.why()
        f["factors"] = [{"name": x.name, "value": x.value, "reason": x.reason} for x in s.factors]
        f["category_label"] = LABEL.get(f["category"], f["category"])

    # 5. group into stories: same company, same category, same day
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for f in filings:
        groups[_story_key(f)].append(f)
    for members in groups.values():
        members.sort(key=lambda x: x["score"], reverse=True)
        lead = members[0]
        lead["story_id"] = lead["id"]
        lead["related"] = [m["id"] for m in members[1:]]
        for m in members[1:]:
            m["story_id"] = lead["id"]
            m["related"] = []

    filings.sort(key=lambda f: (f["filed_at"] or ""), reverse=True)
    return filings


def enriched_at() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")
