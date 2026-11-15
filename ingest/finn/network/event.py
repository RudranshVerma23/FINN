"""Who is best placed to explain THIS event? (FR-08)

"Who do I know at Tata Power" is not the same question as "who can explain Tata Power's
Singapore court appeal". For a material event we score every contact on three things:

  relation  are they at the company, a competitor, supplier or customer (now or before)?
  fit       does their role match the kind of event (legal/regulatory for litigation, strategy/BD
            for M&A, projects/operations for capex, finance for fund raises), and does their
            expertise match the event's subject ("OSAT" in a semiconductor-packaging JV)?
  tie       how well the investor knows them (ties.py)

and keep the best one or two, each with plain-English reasons. Pure code, no LLM (NFR-05).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date

from .model import Network, Person
from .ties import investor_tie
from .who import who_to_call

ROLE_WORDS = {
    "litigation": ["legal", "counsel", "regulatory", "compliance", "law", "litigation"],
    "M&A": ["strategy", "m&a", "business development", "corporate development", "investment banking"],
    "capex": ["projects", "project", "operations", "plant", "engineering", "supply chain", "manufacturing"],
    "fund_raise": ["investment banking", "finance", "cfo", "risk", "treasury", "capital markets"],
}
EVENT_LABEL = {"litigation": "legal / regulatory", "M&A": "deal", "capex": "capex", "fund_raise": "fund raise"}
REL_WEIGHT = {"current": 1.0, "former": 0.9, "competitor": 0.65, "supplier": 0.6, "customer": 0.6, None: 0.5}
# Sector labels that also occur as ordinary words in filings ("financial statements"): too generic to
# count as knowing an event's subject.
GENERIC_EXPERTISE = {"financials", "finance", "consumer", "talent", "infrastructure demand"}
MIN_SCORE = 0.15


@dataclass
class EventContact:
    person_id: str
    name: str
    relation: str | None
    org: str
    role: str
    score: float
    tie_label: str
    why: list[str] = field(default_factory=list)
    caution: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9& ]+", " ", s.lower())


def _phrase_in(phrase: str, text: str) -> bool:
    p = _norm(phrase).strip()
    if not p:
        return False
    variants = {p, p.rstrip("s")}
    return any(re.search(rf"\b{re.escape(v)}s?\b", text) for v in variants if len(v) >= 3)


def _role_fit(p: Person, category: str) -> tuple[str, str] | None:
    """The stint whose role matches the event type, e.g. ('Head, Commercial & Regulatory', 'TPDDL')."""
    words = ROLE_WORDS.get(category, [])
    for s in sorted(p.stints, key=lambda s: (not s.current, -(s.start or 0))):
        role = _norm(f"{s.role} {s.unit}")
        if any(re.search(rf"\b{re.escape(w)}\b", role) for w in words):
            return s.role, s.org_name
    return None


def best_for_event(filing: dict, company_sector: str, net: Network, today: date, limit: int = 2) -> list[EventContact]:
    category = filing["category"]
    symbol = filing["symbol"]
    text = _norm(" ".join([filing.get("headline") or "", filing.get("summary") or "", filing.get("text") or ""]))
    sector = _norm(company_sector or "")

    # relation to the company (company itself, competitors, suppliers, customers), from who.py
    related = {s.person_id: s for s in who_to_call(symbol, net, today, limit=100)}

    out: list[EventContact] = []
    for p in net.contacts.values():
        rel = related.get(p.id)
        relation = rel.relation if rel else None
        role = _role_fit(p, category)
        subject = [e for e in p.expertise if e.lower() not in GENERIC_EXPERTISE and _phrase_in(e, text)]
        sector_fit = [e for e in p.expertise if sector and (_phrase_in(e, sector) or any(_phrase_in(w, _norm(e)) for w in sector.split() if len(w) >= 5))]
        if not rel and not subject:
            continue  # no link to the company and nothing to say about the subject
        # Knowing the event's subject (OSAT for a semiconductor-packaging JV) is the scarcest thing,
        # so it outweighs having once worked at the company.
        fit = 1.0 + (0.3 if role else 0) + (0.6 if subject else 0) + (0.15 if sector_fit and not subject else 0)
        tie = investor_tie(net, p, today)
        score = round(tie.strength * REL_WEIGHT[relation] * fit, 3)

        why: list[str] = []
        if subject:
            why.append(f"Knows the subject: {', '.join(subject[:2])}")
        if role:
            why.append(f"{role[0]} at {role[1]}: the right seat for a {EVENT_LABEL.get(category, 'this kind of')} question")
        if rel:
            why.append({
                "current": f"Works at {rel.org} today",
                "former": f"Was at {rel.org} ({rel.span})",
                "competitor": f"At competitor {rel.org}",
                "supplier": f"At supplier {rel.org}",
                "customer": f"At customer {rel.org}",
            }[relation])
        why.append(tie.reasons[-1] if tie.reasons else f"{tie.label} tie")

        cur = p.current
        caution = None
        if relation == "current":
            caution = "Works there now: ask for context, not unpublished price-sensitive information."
        out.append(EventContact(
            person_id=p.id, name=p.name, relation=relation,
            org=rel.org if rel else (cur.org_name if cur else ""),
            role=cur.role if cur else "", score=score, tie_label=tie.label, why=why, caution=caution,
        ))
    out = [c for c in out if c.score >= MIN_SCORE]
    out.sort(key=lambda c: c.score, reverse=True)
    return out[:limit]
