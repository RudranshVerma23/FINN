"""Who should I call about a company? (FR-22, FR-08)

Ranks contacts by (how well you know them) x (how close they are to the company):
  works there now  > worked there  > at a competitor / supplier / customer.
Each suggestion says what that person would plausibly know, from their role and unit.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

from . import orgs
from .model import Network, today_month
from .ties import investor_tie

ROOT = Path(__file__).resolve().parents[3]

_RELATION_WEIGHT = {"current": 1.0, "former": 0.9, "competitor": 0.6, "supplier": 0.55, "customer": 0.55}


@lru_cache(maxsize=1)
def _links() -> dict:
    return json.loads((ROOT / "config" / "company_links.json").read_text(encoding="utf-8"))["links"]


@dataclass
class Suggestion:
    person_id: str
    name: str
    relation: str           # current | former | competitor | supplier | customer
    org: str
    role: str
    span: str
    score: float
    tie_label: str
    tie_reasons: list[str] = field(default_factory=list)
    angle: str = ""         # what they'd know
    caution: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _angle(relation: str, role: str, unit: str, org_name: str, company: str) -> str:
    focus = f"{role}{', ' + unit if unit else ''}"
    return {
        "current": f"Inside view of {company} today ({focus}).",
        "former": f"How {company} works from the inside ({focus}).",
        "competitor": f"How {company} looks from a competitor, {org_name} ({focus}).",
        "supplier": f"{company}'s demand and terms, seen from supplier {org_name} ({focus}).",
        "customer": f"How {company} performs as a supplier, seen from {org_name} ({focus}).",
    }[relation]


def who_to_call(symbol: str, net: Network, today: date, limit: int = 4) -> list[Suggestion]:
    company_org = orgs.for_symbol(symbol)
    company_name = orgs.name(company_org) if company_org else symbol
    targets: dict[str, str] = {}
    if company_org:
        targets[company_org] = "self"
    for rel, ids in _links().get(symbol, {}).items():
        for oid in ids:
            targets.setdefault(oid, rel.rstrip("s"))  # competitors -> competitor

    now = today_month(today)
    best: dict[str, Suggestion] = {}
    for p in net.contacts.values():
        for s in p.stints:
            if not s.org:
                continue
            rel = targets.get(s.org)
            if not rel and company_org and orgs.group(s.org) == orgs.group(company_org):
                rel = "self"  # a subsidiary of the company, e.g. TPREL for Tata Power
            if not rel:
                continue
            relation = ("current" if s.current else "former") if rel == "self" else rel
            if relation in ("competitor", "supplier", "customer") and not s.current:
                continue  # only people there now are useful for an outside view
            tie = investor_tie(net, p, today)
            recency = 1.0 if s.current else max(0.5, 1 - ((now - (s.end or now)) / 12) * 0.05)
            score = round(tie.strength * _RELATION_WEIGHT[relation] * recency, 3)
            if p.id in best and best[p.id].score >= score:
                continue
            caution = None
            if relation == "current":
                caution = "Works there now: keep it to background, avoid unpublished price-sensitive information."
            best[p.id] = Suggestion(
                person_id=p.id, name=p.name, relation=relation, org=orgs.name(s.org), role=s.role,
                span=s.span(now), score=score, tie_label=tie.label, tie_reasons=tie.reasons,
                angle=_angle(relation, s.role, s.unit, orgs.name(s.org), company_name), caution=caution,
            )
    return sorted(best.values(), key=lambda x: x.score, reverse=True)[:limit]
