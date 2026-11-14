"""People, career stints and education, plus loading the investor's network inputs (FR-18, FR-19).

The same `Person` shape is used for the investor's contacts AND for people who appear
in filings, so matching a filing to the network is a comparison of two careers.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from . import orgs

ROOT = Path(__file__).resolve().parents[3]
NETWORK_DIR = ROOT / "data" / "network"


def month(value: str | None) -> int | None:
    """'2008-04' -> months since year 0; None stays None (unknown)."""
    if not value:
        return None
    m = re.match(r"^(\d{4})(?:-(\d{2}))?", value)
    return int(m.group(1)) * 12 + (int(m.group(2) or 1) - 1) if m else None


def month_label(m: int | None) -> str:
    return str(m // 12) if m is not None else "?"


def today_month(today: date) -> int:
    return today.year * 12 + today.month - 1


@dataclass
class Stint:
    org: str | None          # canonical org id (None = independent)
    org_name: str            # as written in the source
    role: str = ""
    unit: str = ""
    start: int | None = None  # month index; None = unknown
    end: int | None = None    # month index; None = present (or unknown if `approx`)
    current: bool = False
    approx: bool = False          # some date in this stint is estimated or unknown
    start_approx: bool = False    # the start year itself is an estimate

    def span(self, now: int) -> str:
        end = "now" if self.current else month_label(self.end)
        prefix = "~" if self.approx else ""
        return f"{prefix}{month_label(self.start)}–{end}"


@dataclass
class Education:
    org: str | None
    org_name: str
    degree: str = ""
    start: int | None = None
    end: int | None = None


@dataclass
class Person:
    id: str
    name: str
    headline: str = ""
    location: str = ""
    stints: list[Stint] = field(default_factory=list)
    education: list[Education] = field(default_factory=list)
    expertise: list[str] = field(default_factory=list)
    public_figure: bool = False
    connected_on: str | None = None

    @property
    def current(self) -> Stint | None:
        return next((s for s in reversed(self.stints) if s.current), None)


def person_from_dict(pid: str, name: str, d: dict) -> Person:
    """Build a Person from the profile/bio schema (shared by profiles.json and filing extraction)."""
    stints = []
    for s in d.get("stints", []):
        stints.append(Stint(
            org=orgs.canonical(s.get("org")),
            org_name=s.get("org") or "",
            role=s.get("role", ""),
            unit=s.get("unit", ""),
            start=month(s.get("from")),
            end=month(s.get("to")),
            # "to": null means ongoing, unless the end is known to have happened but isn't dated
            current=bool(s.get("current")) or (s.get("to") is None and not s.get("end_unknown")),
            approx=bool(s.get("dates_approximate")) or bool(s.get("end_unknown")),
            start_approx=bool(s.get("dates_approximate")),
        ))
    edu = [Education(org=orgs.canonical(e.get("org")), org_name=e.get("org", ""), degree=e.get("degree", ""),
                     start=month(e.get("from")), end=month(e.get("to"))) for e in d.get("education", [])]
    return Person(
        id=pid, name=name, headline=d.get("headline", ""), location=d.get("location", ""),
        stints=stints, education=edu, expertise=d.get("expertise", []),
        public_figure=bool(d.get("public_figure")),
    )


@dataclass
class Interaction:
    on: date
    kind: str
    note: str


@dataclass
class Network:
    investor: Person
    contacts: dict[str, Person]
    interactions: dict[str, list[Interaction]]


def _slug(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def load(directory: Path = NETWORK_DIR) -> Network:
    """Load the investor's inputs: self-description, connections export, enrichment, interaction log."""
    me = json.loads((directory / "investor.json").read_text(encoding="utf-8"))
    investor = person_from_dict("you", me.get("name", "You"), me)

    profiles = json.loads((directory / "profiles.json").read_text(encoding="utf-8"))["profiles"]
    contacts: dict[str, Person] = {}
    with (directory / "connections.csv").open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            url = row["URL"].strip()
            pid = _slug(url)
            name = f"{row['First Name'].strip()} {row['Last Name'].strip()}".strip()
            prof = profiles.get(url)
            if prof:
                p = person_from_dict(pid, name, prof)
            else:  # connection with no enrichment: we only know the current job
                p = person_from_dict(pid, name, {"stints": [{"org": row["Company"], "role": row["Position"], "from": None, "to": None}]})
            p.connected_on = row.get("Connected On")
            contacts[pid] = p

    interactions: dict[str, list[Interaction]] = {}
    with (directory / "interactions.csv").open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            pid = _slug(row["contact_url"])
            interactions.setdefault(pid, []).append(
                Interaction(on=date.fromisoformat(row["date"]), kind=row["kind"], note=row.get("note", "")))
    for items in interactions.values():
        items.sort(key=lambda i: i.on, reverse=True)

    return Network(investor=investor, contacts=contacts, interactions=interactions)
