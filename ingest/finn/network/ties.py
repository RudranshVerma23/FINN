"""Tie strength, always with reasons (FR-21, NFR-07).

Two kinds of tie:
  investor_tie(net, contact)   how well the investor knows a contact: shared history
                               (detected from both careers) + how recently and often they talk.
  career_link(a, b)            how likely two people know each other professionally:
                               overlapping time at the same org/unit, or the same school and years.

Scores are 0..1 and deliberately simple: every point comes with a sentence the UI can show.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from . import orgs
from .model import Education, Network, Person, Stint, month_label, today_month


@dataclass
class Tie:
    strength: float
    label: str
    reasons: list[str] = field(default_factory=list)
    last_interaction: str | None = None
    interactions_24m: int = 0


def label(strength: float) -> str:
    return "strong" if strength >= 0.7 else "good" if strength >= 0.45 else "light" if strength >= 0.25 else "weak"


# ---------------------------------------------------------------- overlaps


def _end(s, now: int) -> int | None:
    """End month of a stint/education; ongoing periods end 'now'."""
    current = getattr(s, "current", False)
    approx = getattr(s, "approx", False)
    if current or (s.end is None and not approx and s.start is not None and isinstance(s, Stint)):
        return now
    return s.end


def _overlap_months(a, b, now: int) -> int | None:
    """Months two dated periods overlap; None if either side's dates are unknown."""
    a0, a1, b0, b1 = a.start, _end(a, now), b.start, _end(b, now)
    if None in (a0, a1, b0, b1):
        return None
    return max(0, min(a1, b1) - max(a0, b0) + 1)


def _years(months: int) -> str:
    y = months / 12
    return f"{y:.0f} yrs" if y >= 1.5 else "about a year" if y >= 0.75 else f"{months} months"


def _senior(role: str) -> bool:
    r = role.lower()
    return any(k in r for k in ("ceo", "chief executive", "managing director", "president", "head of", "md "))


@dataclass
class Overlap:
    kind: str            # "same_org" | "same_group" | "school"
    org: str
    months: int | None   # None = dates unclear
    same_unit: bool = False
    a: Stint | Education | None = None
    b: Stint | Education | None = None


def overlaps(a: Person, b: Person, now: int) -> list[Overlap]:
    out: list[Overlap] = []
    for sa in a.stints:
        for sb in b.stints:
            if not sa.org or not sb.org:
                continue
            if sa.org == sb.org:
                kind = "same_org"
            elif orgs.group(sa.org) == orgs.group(sb.org):
                kind = "same_group"
            else:
                continue
            m = _overlap_months(sa, sb, now)
            if m == 0:
                continue
            same_unit = bool(sa.unit and sb.unit and sa.unit.lower() == sb.unit.lower())
            out.append(Overlap(kind, sa.org if kind == "same_org" else orgs.group(sa.org), m, same_unit, sa, sb))
    for ea in a.education:
        for eb in b.education:
            if ea.org and ea.org == eb.org:
                m = _overlap_months(ea, eb, now) if None not in (ea.start, eb.start) else None
                out.append(Overlap("school", ea.org, m, False, ea, eb))
    return out


def _shared_sequence(a: Person, b: Person, plausible: set[str]) -> list[str] | None:
    """Two or more employers both people worked at, in the same order, counting only employers
    where their time there could have overlapped (`plausible`). Both moving NTPC -> TPREL twenty
    years apart is not a shared path."""
    def order(p: Person) -> list[str]:
        seq: list[str] = []
        for s in p.stints:
            if s.org and (not seq or seq[-1] != s.org):
                seq.append(s.org)
        return seq

    sa, sb = order(a), order(b)
    common = [o for o in sa if o in sb and o in plausible]
    if len(set(common)) < 2:
        return None
    # keep only orgs that appear in the same relative order in both careers
    seq, last = [], -1
    for o in common:
        idx = sb.index(o)
        if idx > last:
            seq.append(o)
            last = idx
    return [orgs.name(o) for o in dict.fromkeys(seq)] if len(set(seq)) >= 2 else None


# ---------------------------------------------------------------- investor -> contact


def investor_tie(net: Network, contact: Person, today: date) -> Tie:
    now = today_month(today)
    base, reasons = 0.2, []
    for ov in overlaps(net.investor, contact, now):
        if ov.kind == "school":
            if ov.months:
                same_batch = ov.a.start == ov.b.start and ov.a.end == ov.b.end
                score = 0.55 if same_batch else 0.45
                reasons.append(f"{'Same batch' if same_batch else 'Overlapped'} at {orgs.name(ov.org)} ({month_label(ov.b.start)}–{month_label(ov.b.end)})")
            else:
                score = 0.25
                reasons.append(f"Fellow {orgs.name(ov.org)} alum")
        elif ov.months:
            score = 0.5 if ov.kind == "same_org" else 0.35
            where = orgs.name(ov.org) if ov.kind == "same_org" else f"the {orgs.name(ov.org)} group"
            reasons.append(f"Worked together at {where} for {_years(ov.months)}")
        else:
            continue
        base = max(base, score)
    if not reasons and contact.connected_on:
        reasons.append(f"Professional contact since {contact.connected_on[-4:]}")

    talks = net.interactions.get(contact.id, [])
    recent = [i for i in talks if (today - i.on).days <= 730]
    bonus = min(0.15, 0.05 * len(recent))
    last = talks[0] if talks else None
    if last:
        days = (today - last.on).days
        bonus += 0.3 if days <= 90 else 0.2 if days <= 180 else 0.1 if days <= 365 else 0.0 if days <= 730 else -0.05
        when = last.on.strftime("%b %Y")
        reasons.append(f"Last spoke {when} ({last.kind}{': ' + last.note if last.note else ''})")
    else:
        reasons.append("No logged conversations")

    strength = round(max(0.05, min(0.98, base + bonus)), 2)
    return Tie(strength, label(strength), reasons,
               last_interaction=last.on.isoformat() if last else None, interactions_24m=len(recent))


# ---------------------------------------------------------------- person <-> person


def career_link(contact: Person, target: Person, today: date) -> Tie | None:
    """How likely `contact` knows `target` from their careers. None if no overlap at all."""
    now = today_month(today)
    surname = target.name.split()[-1] if target.name else "they"
    best_per_org: dict[tuple[str, str], tuple[float, str]] = {}
    found = overlaps(contact, target, now)  # only overlapping or not-disproven periods
    plausible = {ov.org for ov in found if ov.kind == "same_org"}
    for ov in found:
        org = orgs.name(ov.org)
        if ov.kind == "school":
            score, text = (0.3, f"studied at {org} at the same time") if ov.months else (0.08, f"both {org} alumni")
        elif ov.months is None:
            unit = ov.a.unit if ov.same_unit else ""
            a0, b0 = ov.a.start, ov.b.start
            if ov.kind == "same_org" and ov.a.current and ov.b.current:
                score, text = 0.42, f"both at {org} today"
                if _senior(ov.b.role) and not _senior(ov.a.role):
                    text += f", where {surname} is {ov.b.role}"
            elif ov.kind == "same_group":
                score, text = 0.1, f"both in the {org} group (exact years unclear)"
            elif unit:
                possessive = f"{org}'" if org.endswith("s") else f"{org}'s"
                score, text = 0.35, f"both in {possessive} {unit} function (exact years unclear)"
            elif a0 is not None and b0 is not None and b0 <= a0 <= (_end(ov.a, now) or now):
                # The target was there first and their end isn't stated: a likely, not proven, overlap.
                score = 0.34
                when = f"around {month_label(b0)}" if ov.b.start_approx else f"by {month_label(b0)}"
                text = (f"{surname} had joined {org} {when}; {contact.name.split()[0]} was there "
                        f"{month_label(a0)}–{'now' if ov.a.current else month_label(ov.a.end)} (how long they overlapped isn't stated)")
            else:
                score, text = 0.25, f"both worked at {org} (exact years unclear)"
        else:
            score = 0.3 + min(ov.months, 96) / 96 * 0.3
            if ov.kind == "same_group":
                score *= 0.5
                text = (f"both in the {org} group for {_years(ov.months)} "
                        f"({contact.name.split()[0]} at {ov.a.org_name}, {surname} at {ov.b.org_name})")
            else:
                text = f"overlapped {_years(ov.months)} at {org}"
                if ov.same_unit:
                    score += 0.15
                    text += f", same unit ({ov.a.unit})"
                if _senior(ov.b.role) and not _senior(ov.a.role):
                    score += 0.05
                    text += f", while {surname} was {ov.b.role}"
            if now - min(_end(ov.a, now) or now, _end(ov.b, now) or now) > 120:  # ended 10+ years ago
                score *= 0.8
                text += " (over a decade ago)"
            if ov.a.current and ov.b.current and ov.kind == "same_org":
                text += "; both there today"
        key = (ov.kind == "school" and "school" or "work", ov.org)
        if key not in best_per_org or best_per_org[key][0] < score:
            best_per_org[key] = (score, text)
    if not best_per_org:
        return None
    scored = sorted(best_per_org.values(), reverse=True)
    strength = scored[0][0] + 0.1 * sum(s for s, _ in scored[1:])

    # Same career path: both moved A -> B in that order (e.g. Wipro -> Birlasoft). Strong evidence
    # they worked together, often that one followed the other.
    path = _shared_sequence(contact, target, plausible)
    if path:
        strength += 0.25
        scored.insert(0, (1.0, f"same career path: {' → '.join(path)}"))
    strength = round(min(0.9, strength), 2)
    return Tie(strength, label(strength), [t for _, t in scored])
