// Data access layer (NFR-09). The ONLY module that knows the snapshot is JSON files.
// Moving to Postgres later means rewriting these functions, nothing else.
import "server-only";

import companiesJson from "@/data/companies.json";
import filingsJson from "@/data/filings.json";
import metaJson from "@/data/meta.json";
import networkJson from "@/data/network.json";
import pricesJson from "@/data/prices.json";

import type { Bar, Company, Filing, Meta, NetworkSnapshot, StoryCard } from "./types";

const companies = companiesJson as unknown as Record<string, Company>;
const filings = filingsJson as unknown as Filing[];
const meta = metaJson as unknown as Meta;
const network = networkJson as unknown as NetworkSnapshot;
const prices = pricesJson as unknown as Record<string, Bar[]>;

export function shortName(name: string): string {
  return name
    .replace(/\s+(Limited|Ltd\.?)$/i, "")
    .replace(/\s*\(India\)/i, "")
    .replace(/Corporation of India/i, "Corp")
    .replace(/Enterprise$/i, "")
    .trim();
}

export function getMeta(): Meta {
  return meta;
}

export function getCompanies(): Company[] {
  return Object.values(companies).sort((a, b) => b.weight - a.weight);
}

export function getCompany(symbol: string): Company | undefined {
  return companies[symbol];
}

export function getPrices(symbol: string): Bar[] {
  return prices[symbol] ?? [];
}

export function getWhoToCall(symbol: string) {
  return network.who_to_call[symbol] ?? [];
}

export function getContact(id: string) {
  return network.contacts.find((c) => c.id === id);
}

function toCard(f: Filing): StoryCard {
  const c = companies[f.symbol];
  const top = (network.who_to_call[f.symbol] ?? [])[0];
  return {
    id: f.id,
    symbol: f.symbol,
    company: shortName(c?.name ?? f.company),
    filedAt: f.filed_at,
    tier: f.tier,
    score: f.score,
    category: f.category,
    categoryLabel: f.category_label,
    headline: f.headline || f.title,
    summary: f.summary ?? null,
    why: f.why.filter((w) => w !== f.category_label && !w.startsWith(f.category_label + " ")),
    reaction: f.reaction,
    relatedCount: f.related.length,
    url: f.attachment_url,
    inPortfolio: c?.in_portfolio ?? false,
    weight: c?.weight ?? 0,
    contact:
      top && top.score >= 0.25 && f.tier !== "routine"
        ? { name: top.name, relation: top.relation, org: top.org, tie: top.tie_label, angle: top.angle, caution: top.caution }
        : null,
    people: (f.people ?? []).filter((p) => p.change !== "reappointed"),
  };
}

/** One card per story (the highest-scoring filing of each group), newest first. */
export function getStories(symbol?: string): StoryCard[] {
  return filings
    .filter((f) => f.story_id === f.id && (!symbol || f.symbol === symbol))
    .map(toCard)
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

/** Day-over-day change on the last trading day. */
export function lastMove(symbol: string): { close: number; pct: number } | null {
  const b = prices[symbol];
  if (!b || b.length < 2) return null;
  const [prev, cur] = [b[b.length - 2], b[b.length - 1]];
  return { close: cur.close, pct: (cur.close / prev.close - 1) * 100 };
}
