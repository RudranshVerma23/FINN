"""Reasons to reconnect (FR-23): keep the network warm with a natural opener.

A contact you haven't spoken to in a while + their current or former employer (or a company
they compete with) just had a material event = a reason to call that isn't "just catching up".

    score = dormancy x how material the event is x how close they are to it x how well you know them

Pure code, no LLM (NFR-05).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

from . import orgs
from .model import Network
from .ties import investor_tie

DORMANT_DAYS = 180
MAX_PER_KIND = 2
REL_WEIGHT = {"current": 1.0, "former": 0.85, "competitor": 0.6}


@dataclass
class Reconnect:
    person_id: str
    name: str
    last_spoke: str | None  # ISO date, None = never logged
    days_since: int | None
    relation: str           # current | former | competitor
    org: str                # where they are / were
    span: str
    symbol: str             # the company with the event
    company: str
    story_id: str
    headline: str
    category_label: str
    filed_at: str
    tie_label: str
    score: float

    def to_dict(self) -> dict:
        return asdict(self)


def _company_orgs(symbol: str) -> set[str]:
    oid = orgs.for_symbol(symbol)
    return {oid, orgs.group(oid)} if oid else set()


def reasons_to_reconnect(net: Network, stories: list[dict], companies: dict, links: dict, today: date,
                         limit: int = 5) -> list[Reconnect]:
    """`stories`: material story leads (dicts from filings.json) from the recent window."""
    from .model import today_month

    now = today_month(today)
    best: dict[str, Reconnect] = {}
    for p in net.contacts.values():
        talks = net.interactions.get(p.id, [])
        last = talks[0].on if talks else None
        days = (today - last).days if last else None
        if days is not None and days < DORMANT_DAYS:
            continue
        tie = investor_tie(net, p, today)
        for s in stories:
            sym = s["symbol"]
            targets = _company_orgs(sym)
            competitors = {orgs.group(o) for o in links.get(sym, {}).get("competitors", [])}
            for st in p.stints:
                if not st.org:
                    continue
                g = orgs.group(st.org)
                if st.org in targets or g in targets:
                    relation = "current" if st.current else "former"
                elif st.current and g in competitors:
                    relation = "competitor"
                else:
                    continue
                dormancy = min(2.0, 1.0 + ((days if days is not None else 540) - DORMANT_DAYS) / 365)
                score = round(dormancy * (s["score"] / 100) * REL_WEIGHT[relation] * (0.5 + tie.strength), 3)
                cand = Reconnect(
                    person_id=p.id, name=p.name, last_spoke=last.isoformat() if last else None, days_since=days,
                    relation=relation, org=st.org_name, span=st.span(now), symbol=sym,
                    company=companies.get(sym, {}).get("name", sym), story_id=s["id"],
                    headline=s.get("results_headline") or s.get("headline") or s["title"],
                    category_label=s.get("category_label", ""), filed_at=s["filed_at"], tie_label=tie.label, score=score,
                )
                if p.id not in best or best[p.id].score < cand.score:
                    best[p.id] = cand
    # Vary the reasons: in results season every nudge would otherwise be "they reported".
    ranked, per_kind = [], {}
    for r in sorted(best.values(), key=lambda r: r.score, reverse=True):
        if per_kind.get(r.category_label, 0) >= MAX_PER_KIND:
            continue
        per_kind[r.category_label] = per_kind.get(r.category_label, 0) + 1
        ranked.append(r)
    return ranked[:limit]
