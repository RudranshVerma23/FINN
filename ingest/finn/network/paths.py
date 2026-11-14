"""Paths from the investor to anyone with a known career (FR-06, FR-21).

  direct     the investor already knows them (entity-resolved among contacts),
             or overlapped with them personally;
  via        investor -> contact -> target, where the contact's career overlaps the target's.

Path strength = strength of each hop multiplied, so a strong friend with a weak link can
rank below a lighter contact who sat in the same team as the target for years.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date

from . import orgs
from .model import Network, Person
from .resolve import match
from .ties import career_link, investor_tie, label


@dataclass
class Path:
    kind: str                         # "direct" | "via"
    strength: float
    label: str
    via_id: str | None = None
    via_name: str | None = None
    hop1: list[str] = field(default_factory=list)   # why you know the contact (or the target)
    hop2: list[str] = field(default_factory=list)   # why the contact knows the target
    caution: str | None = None                      # e.g. contact works at the same company today
    match_confidence: float | None = None
    hop1_label: str | None = None                   # you -> contact
    hop2_label: str | None = None                   # contact -> target

    def to_dict(self) -> dict:
        return asdict(self)


def _caution(contact: Person, target: Person) -> str | None:
    cur_c, cur_t = contact.current, target.current
    if cur_c and cur_t and cur_c.org and orgs.group(cur_c.org) == orgs.group(cur_t.org):
        return (f"{contact.name} currently works at {orgs.name(orgs.group(cur_c.org))}. "
                "Keep it to background; don't seek unpublished price-sensitive information.")
    return None


def paths_to(target: Person, net: Network, today: date, limit: int = 3) -> list[Path]:
    out: list[Path] = []
    matched_ids: set[str] = set()

    # 1. Does the investor already know this person?
    for cand in match(target, net.contacts):
        tie = investor_tie(net, cand.person, today)
        out.append(Path("direct", tie.strength, tie.label, cand.person.id, cand.person.name,
                        hop1=cand.evidence + tie.reasons, match_confidence=cand.confidence, hop1_label=tie.label))
        matched_ids.add(cand.person.id)

    # 2. Did the investor personally overlap with them?
    mine = career_link(net.investor, target, today)
    if mine and mine.strength >= 0.25:
        out.append(Path("direct", mine.strength, mine.label, hop1=["You " + r for r in mine.reasons]))

    # 3. Second degree through contacts whose careers overlap the target's.
    for contact in net.contacts.values():
        if contact.id in matched_ids:
            continue
        link = career_link(contact, target, today)
        if not link or link.strength < 0.15:
            continue
        tie = investor_tie(net, contact, today)
        strength = round(tie.strength * link.strength, 2)
        # A two-hop path is labelled on a scale 1.6x looser than a single tie (0.6 x 0.6 ~ "strong").
        out.append(Path("via", strength, label(strength * 1.6), contact.id, contact.name,
                        hop1=tie.reasons, hop2=link.reasons, caution=_caution(contact, target),
                        hop1_label=tie.label, hop2_label=link.label))

    # Rank by strength. A faint direct acquaintance ("met once in 2024") must not hide a
    # batchmate who sat in the target's unit for nine years; the UI marks direct ties anyway.
    out.sort(key=lambda p: -p.strength)
    direct = [p for p in out if p.kind == "direct" and (p.match_confidence or 1) >= 0.85]
    top = out[:limit]
    if direct and direct[0] not in top:
        top[-1] = direct[0]  # always surface "you've met them"
    return top
