"""Build the Network part of the snapshot (FR-18..FR-22) and print the demo stories.

Writes data/snapshot/network.json:
  contacts       every contact with current role, expertise and tie strength (+ reasons)
  who_to_call    per portfolio/watchlist company, ranked suggestions
  expertise      theme -> contacts (the expertise map)
and, with --stories, prints the paths to the real executives in the fixture file.

Run from the repo root:
    python ingest/scripts/build_network.py [--stories]
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finn.network import model, orgs  # noqa: E402
from finn.network.paths import paths_to  # noqa: E402
from finn.network.ties import investor_tie  # noqa: E402
from finn.network.who import who_to_call  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "data" / "snapshot"
FIXTURES = ROOT / "ingest" / "tests" / "fixtures" / "filing_people.json"


def snapshot_today() -> date:
    meta = SNAP / "meta.json"
    if meta.exists():
        return date.fromisoformat(json.loads(meta.read_text(encoding="utf-8"))["filings_to"])
    return date.today()


def build(today: date) -> dict:
    net = model.load()
    now = model.today_month(today)
    contacts = []
    for p in net.contacts.values():
        tie = investor_tie(net, p, today)
        cur = p.current
        contacts.append({
            "id": p.id,
            "name": p.name,
            "headline": p.headline,
            "location": p.location,
            "current": {"org": cur.org_name, "role": cur.role} if cur else None,
            "career": [{"org": s.org_name, "org_id": s.org, "role": s.role, "span": s.span(now)} for s in p.stints],
            "education": [{"org": e.org_name, "degree": e.degree} for e in p.education],
            "expertise": p.expertise,
            "public_figure": p.public_figure,
            "tie": tie.__dict__,
            # The investor's own log (private in a real deployment; synthetic here)
            "interactions": [{"on": i.on.isoformat(), "kind": i.kind, "note": i.note} for i in net.interactions.get(p.id, [])],
        })
    contacts.sort(key=lambda c: c["tie"]["strength"], reverse=True)

    portfolio = json.loads((ROOT / "config" / "portfolio.json").read_text(encoding="utf-8"))
    symbols = [h["symbol"] for h in portfolio["holdings"]] + [w["symbol"] for w in portfolio["watchlist"]]
    who = {s: [x.to_dict() for x in who_to_call(s, net, today)] for s in symbols}

    expertise: dict[str, list[str]] = {}
    for c in contacts:
        for tag in c["expertise"]:
            expertise.setdefault(tag, []).append(c["id"])

    return {
        "_comment": "SYNTHETIC network (fictional people) plus public filing facts. Real deployment keeps this private per investor.",
        "as_of": today.isoformat(),
        "investor": {"headline": "Partner, public-markets fund",
                     "career": [{"org": s.org_name, "role": s.role, "span": s.span(now)} for s in net.investor.stints],
                     "education": [{"org": e.org_name, "degree": e.degree} for e in net.investor.education]},
        "contacts": contacts,
        "who_to_call": who,
        "expertise": dict(sorted(expertise.items(), key=lambda kv: -len(kv[1]))),
    }, net


def stories(net, today: date) -> None:
    people = json.loads(FIXTURES.read_text(encoding="utf-8"))["people"]
    for d in people:
        target = model.person_from_dict(d["filing_id"], d["name"], d)
        print(f"\n▶ {d['symbol']}: {d['name']} — {d['event']}")
        found = paths_to(target, net, today)
        if not found:
            print("   no one in your network is connected (honest negative)")
        for p in found:
            who = p.via_name or "You"
            print(f"   [{p.kind}] {who}  strength={p.strength} ({p.label})"
                  + (f"  match={p.match_confidence}" if p.match_confidence else ""))
            for r in p.hop1:
                print(f"       you↔{who}: {r}")
            for r in p.hop2:
                print(f"       {who}↔{d['name']}: {r}")
            if p.caution:
                print(f"       ⚠ {p.caution}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stories", action="store_true")
    args = ap.parse_args()
    today = snapshot_today()
    data, net = build(today)
    SNAP.mkdir(parents=True, exist_ok=True)
    (SNAP / "network.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"network.json: {len(data['contacts'])} contacts, {len(data['expertise'])} expertise themes, as of {today}")
    print("Top ties:", [(c["name"], c["tie"]["strength"]) for c in data["contacts"][:5]])
    if args.stories:
        stories(net, today)
        for s in ("PIIND", "KAYNES", "DEEPAKNTR", "TATAPOWER"):
            print(f"\n☎ who to call: {s}")
            for x in data["who_to_call"][s]:
                print(f"   {x['name']:18} {x['relation']:10} {x['org']} ({x['span']})  score={x['score']}  {x['angle']}")
