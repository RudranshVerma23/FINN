"""Entity resolution: is the person named in a filing someone FINN already knows? (FR-20)

Evidence combined:
  - name similarity, tolerant of honorifics ("Mr.", "Shri"), initials ("V. N. Srivatsan")
    and token order;
  - career evidence: an organisation in the filing person's history that also appears in
    the contact's history.
Every candidate carries its score and the evidence behind it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from .model import Person

_HONORIFICS = {"mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "prof", "cs", "ca", "capt", "col", "late"}


def normalize_name(name: str) -> list[str]:
    tokens = re.sub(r"[^\w\s]", " ", name.lower()).split()
    return [t for t in tokens if t not in _HONORIFICS]


def name_similarity(a: str, b: str) -> float:
    """0..1. Handles initials: 'v n srivatsan' vs 'venkat n srivatsan' scores high."""
    ta, tb = normalize_name(a), normalize_name(b)
    if not ta or not tb:
        return 0.0
    base = fuzz.token_sort_ratio(" ".join(ta), " ".join(tb)) / 100
    if ta[-1] == tb[-1]:  # same surname: check the given names/initials are compatible
        ga, gb = ta[:-1], tb[:-1]
        compatible = all(any(x == y or (len(x) == 1 and y.startswith(x)) or (len(y) == 1 and x.startswith(y))
                             for y in gb) for x in ga) if ga and gb else True
        if compatible:
            base = max(base, 0.9 if ga and gb else 0.75)
    return round(base, 3)


@dataclass
class Candidate:
    person: Person
    confidence: float
    evidence: list[str] = field(default_factory=list)


def match(target: Person, people: dict[str, Person], threshold: float = 0.6) -> list[Candidate]:
    target_orgs = {s.org for s in target.stints if s.org}
    out = []
    for p in people.values():
        sim = name_similarity(target.name, p.name)
        if sim < 0.8:
            continue
        evidence = [f"name match {sim:.0%} ('{target.name}' ~ '{p.name}')"]
        shared = sorted({s.org_name for s in p.stints if s.org in target_orgs})
        conf = 0.7 * sim
        if shared:
            conf += 0.3
            evidence.append("both careers include " + ", ".join(shared))
        elif target_orgs and p.stints:
            conf -= 0.1
            evidence.append("no shared employer: could be a namesake")
        conf = round(max(0.0, min(1.0, conf)), 2)
        if conf >= threshold:
            out.append(Candidate(p, conf, evidence))
    out.sort(key=lambda c: c.confidence, reverse=True)
    return out
