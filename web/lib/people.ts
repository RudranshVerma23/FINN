// The Network queried directly (FR-24): people, the expertise map, and where each person
// shows up across FINN. Server-side only; pure lookups over the snapshot, no model.
import "server-only";

import filingsJson from "@/data/filings.json";
import networkJson from "@/data/network.json";
import reconnectJson from "@/data/reconnect.json";

import { shortName } from "./names";
import type { Contact, Filing, NetworkSnapshot, Reconnect } from "./types";

const network = networkJson as unknown as NetworkSnapshot;
const filings = filingsJson as unknown as Filing[];
const reconnect = reconnectJson as unknown as Reconnect[];

export function getPeople(): Contact[] {
  return [...network.contacts].sort((a, b) => b.tie.strength - a.tie.strength);
}

export function getPerson(id: string): Contact | undefined {
  return network.contacts.find((c) => c.id === id);
}

export interface Appearances {
  calls: { symbol: string; relation: string; org: string; angle: string }[];
  paths: { symbol: string; target: string; role: string; label: string; reason: string }[];
  events: { symbol: string; headline: string; why: string }[];
  reconnect: Reconnect | undefined;
}

/** Everywhere this person is FINN's answer: who to call, a way in to a new executive, an event, a reconnect. */
export function appearances(id: string): Appearances {
  const calls = Object.entries(network.who_to_call).flatMap(([symbol, list]) =>
    list.filter((s) => s.person_id === id).map((s) => ({ symbol, relation: s.relation, org: s.org, angle: s.angle })),
  );
  const paths: Appearances["paths"] = [];
  const events: Appearances["events"] = [];
  for (const f of filings) {
    if (f.story_id !== f.id) continue;
    for (const p of f.people ?? []) {
      const path = p.paths.find((x) => x.via_id === id && x.kind === "via");
      if (path) paths.push({ symbol: f.symbol, target: p.name, role: p.role, label: path.label, reason: path.hop2[0] ?? "" });
    }
    const ev = (f.event_contacts ?? []).find((c) => c.person_id === id);
    if (ev && f.tier !== "routine") events.push({ symbol: f.symbol, headline: f.headline || f.title, why: ev.why[0] ?? "" });
  }
  return { calls, paths, events: events.slice(0, 4), reconnect: reconnect.find((r) => r.person_id === id) };
}

/** Themes at least two people know about, biggest first: the shape of the investor's network. */
export function expertiseMap(min = 2): { theme: string; ids: string[] }[] {
  return Object.entries(network.expertise)
    .filter(([, ids]) => ids.length >= min)
    .map(([theme, ids]) => ({ theme, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.theme.localeCompare(b.theme));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
const stem = (w: string) => w.replace(/(ies|es|s)$/, "");

/** Go-to people for a theme ("semiconductors", "rural lending"): expertise first, then roles and employers. */
export function findExperts(theme: string, limit = 6): { contact: Contact; because: string }[] {
  const words = norm(theme).split(" ").filter((w) => w.length >= 3).map(stem);
  if (!words.length) return [];
  const hits: { contact: Contact; because: string; score: number }[] = [];
  for (const c of network.contacts) {
    const ex = c.expertise.find((e) => words.every((w) => norm(e).split(" ").map(stem).some((x) => x.startsWith(w))));
    const roleHit = c.career.find((s) => words.every((w) => norm(`${s.role} ${s.org}`).includes(w)));
    const headHit = words.every((w) => norm(c.headline).includes(w));
    if (!ex && !roleHit && !headHit) continue;
    const because = ex ? `expertise: ${ex}` : roleHit ? `${roleHit.role}, ${shortName(roleHit.org)}` : c.headline;
    hits.push({ contact: c, because, score: (ex ? 1 : roleHit ? 0.7 : 0.5) * (0.4 + c.tie.strength) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
