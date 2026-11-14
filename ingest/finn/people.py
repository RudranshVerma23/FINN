"""Who is the new CFO, and who do I know who knows them? (FR-06, FR-19..FR-21)

1. Extract every person a management-change filing announces, with the profile the filing
   itself discloses (SEBI requires a brief profile for appointments): role, effective date,
   short bio, career stints and education, in the same schema the network engine uses.
   Bulk model, 3 filings per call, cached.
2. Turn each incoming person into a `Person` and find paths from the investor (paths.py).
   The LLM never sees the network; matching happens in code (NFR-05).
"""

from __future__ import annotations

import re
from datetime import date

from . import llm
from .documents import pdf_text
from .network import model, orgs
from .network.paths import paths_to

BATCH = 3
CHARS = 7000

SYSTEM = """You extract people from Indian stock-exchange filings about management changes.
Use ONLY the filing text. Never add facts about a person from outside knowledge, even if you recognise them.
For every person whose appointment, cessation, resignation, retirement, re-appointment or change of role
the filing announces, return:
- name: full name without honorifics (no Mr/Ms/Dr/Shri)
- role: the role as stated
- change: "joins" (new appointment, incl. designate), "leaves" (cessation, resignation, retirement,
  superannuation), "redesignated" (moves to a different role), or "reappointed"
- effective: YYYY-MM-DD if stated, else null
- bio: at most 35 words summarising ONLY the profile in the filing; null if the filing has no profile
- stints: EVERY employer the profile mentions, oldest first, each {org, role, from, to, dates_approximate}.
  A long earlier career at the same company as the new role is its own stint (e.g. "spent 28 years with
  Wipro" before Birlasoft is a past Wipro stint, separate from the new Wipro appointment).
  from/to are "YYYY" or "YYYY-MM" ONLY if the text states or directly implies them (e.g. "from 1989 to 1995",
  "joined in 2003"). If only a duration is given ("over 28 years with Wipro"), estimate years by counting
  back from the filing date and set dates_approximate true. Unknown: null. Only the role held today has
  to = null; an earlier role that the person has since left must not have to = null unless the end is
  unknown, in which case set dates_approximate true.
  Include the announcing company itself with the new role and from = the effective date.
- education: list of {org, degree}
Return an empty list for a filing that names no specific person."""

SCHEMA = {
    "type": "object",
    "properties": {
        "filings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "people": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "role": {"type": "string"},
                                "change": {"type": "string", "enum": ["joins", "leaves", "redesignated", "reappointed"]},
                                "effective": {"type": ["string", "null"]},
                                "bio": {"type": ["string", "null"]},
                                "stints": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "org": {"type": "string"},
                                            "role": {"type": "string"},
                                            "from": {"type": ["string", "null"]},
                                            "to": {"type": ["string", "null"]},
                                            "dates_approximate": {"type": "boolean"},
                                        },
                                        "required": ["org", "role", "from", "to", "dates_approximate"],
                                    },
                                },
                                "education": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {"org": {"type": "string"}, "degree": {"type": "string"}},
                                        "required": ["org", "degree"],
                                    },
                                },
                            },
                            "required": ["name", "role", "change", "effective", "bio", "stints", "education"],
                        },
                    },
                },
                "required": ["id", "people"],
            },
        }
    },
    "required": ["filings"],
}

_HONORIFIC = re.compile(r"^(mr|mrs|ms|dr|shri|smt|sri|prof)\.?\s+", re.I)


def _clean_name(name: str) -> str:
    return _HONORIFIC.sub("", name.strip()).strip()


def extract(filings: list[dict], log=print) -> dict[str, list[dict]]:
    """filing id -> people announced in it."""
    out: dict[str, list[dict]] = {}
    for i in range(0, len(filings), BATCH):
        batch = filings[i:i + BATCH]
        blocks = []
        for f in batch:
            body = pdf_text(f.get("attachment_url") or "", max_pages=8)[:CHARS] or "(no attachment text)"
            blocks.append(f"### id: {f['id']}\ncompany: {f['company']}\nfiled: {f['filed_at'][:10]}\n"
                          f"exchange text: {f['text'][:400]}\nfiling: {body}\n")
        try:
            res = llm.ask("\n".join(blocks), "bulk", system=SYSTEM, schema=SCHEMA, label="extract_people")
        except Exception as e:
            log(f"  batch {i // BATCH + 1} failed: {e}")
            continue
        for item in res.get("filings", []):
            people = []
            for p in item.get("people", []):
                p["name"] = _clean_name(p["name"])
                if p["name"]:
                    people.append(p)
            out[item["id"]] = people
    return out


MIN_PATH = 0.1  # below this a "path" is noise ("both alumni of a 10,000-person school")


def close_stints(stints: list[dict], today: date) -> list[dict]:
    """A stint followed by a role that has already started has ended, even if `to` is empty.

    If that next role's start is known the stint ends then; otherwise its end is marked unknown
    (`end_unknown`) rather than silently 'present', which would invent overlaps. A role that
    starts in the future (a CEO-designate from May 2027) does not end today's role.
    """
    out = [dict(s) for s in stints]
    # Joining a different group means leaving the current employer, even if the new role starts
    # later (Guha leaves Birlasoft for Wipro). Moving within a group (TPREL -> Tata Power) does not.
    if len(out) >= 2 and out[-1].get("from") and out[-2].get("to") is None:
        new_group = orgs.group(orgs.canonical(out[-1]["org"]))
        prev_group = orgs.group(orgs.canonical(out[-2]["org"]))
        if new_group and prev_group and new_group != prev_group:
            out[-2]["end_unknown"] = True
    started = [s for s in out if not s.get("from") or s["from"] <= today.isoformat()]
    for i, s in enumerate(out):
        if s.get("to") is not None or s.get("end_unknown"):
            continue
        later = [t for t in out[i + 1:] if t in started]
        if not later:
            continue  # nothing has replaced it yet: still current
        nxt = later[0].get("from")
        if nxt and s.get("from") and nxt > s["from"]:
            s["to"] = nxt
        else:
            s["end_unknown"] = True
    return out


def with_paths(person: dict, net: model.Network, today: date) -> dict:
    """Attach the investor's paths to an extracted person (incoming people only)."""
    person = {**person, "stints": close_stints(person.get("stints", []), today)}
    target = model.person_from_dict(f"filing:{person['name']}", person["name"], person)
    found = paths_to(target, net, today) if person["change"] in ("joins", "redesignated") else []
    return {**person, "paths": [p.to_dict() for p in found if p.strength >= MIN_PATH]}
