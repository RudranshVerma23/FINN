// Data access layer (NFR-09). The ONLY module that knows the snapshot is JSON files.
// Moving to Postgres later means rewriting these functions, nothing else.
import "server-only";

import companiesJson from "@/data/companies.json";
import filingsJson from "@/data/filings.json";
import metaJson from "@/data/meta.json";
import networkJson from "@/data/network.json";
import pricesJson from "@/data/prices.json";
import preferencesJson from "@/data/preferences.json";
import reconnectJson from "@/data/reconnect.json";
import resultsJson from "@/data/results.json";

import type { AlertCompany, AlertSettings, SlimBar, SlimFiling } from "./alerts";
import { shortName } from "./names";

import type { Bar, Company, Filing, Meta, NetworkSnapshot, Reconnect, Results, StoryCard, Suggestion } from "./types";

const companies = companiesJson as unknown as Record<string, Company>;
const filings = filingsJson as unknown as Filing[];
const meta = metaJson as unknown as Meta;
const network = networkJson as unknown as NetworkSnapshot;
const prices = pricesJson as unknown as Record<string, Bar[]>;
const results = resultsJson as unknown as Record<string, Results>;

export function getReconnect(): Reconnect[] {
  return reconnectJson as unknown as Reconnect[];
}

export function getResults(symbol: string): Results | null {
  return results[symbol] ?? null;
}

/** Results numbers belong on the results story filed within two days of the XBRL. */
function resultsFor(f: Filing): Results | null {
  const r = results[f.symbol];
  if (!r || !r.filed_at || f.category !== "results") return null;
  const gap = Math.abs(new Date(f.filed_at).getTime() - new Date(r.filed_at).getTime());
  return gap <= 2 * 86400000 ? r : null;
}

export { shortName };

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

export interface Caller {
  id: string;
  name: string;
  relation: Suggestion["relation"];
  org: string;
  role: string;
  span: string;
  tie: string;
  tieReasons: string[];
  angle: string;
  caution: string | null;
}

const normOrg = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(ltd|limited|india|pvt|private|the|co|company|corporation|industries|enterprises?)\b\.?/g, " ")
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Who to call about any company (FR-22). Known companies use the precomputed ranking (company,
 * competitors, suppliers, customers). For a ticker FINN has never seen, match the company's name
 * against every contact's career, so the network still answers inside Pull for any NSE ticker.
 */
export function getCallers(symbol: string, companyName: string): Caller[] {
  const known = network.who_to_call[symbol];
  if (known) {
    return known.map((s) => ({
      id: s.person_id, name: s.name, relation: s.relation, org: s.org, role: s.role, span: s.span, tie: s.tie_label,
      tieReasons: s.tie_reasons, angle: s.angle, caution: s.caution,
    }));
  }
  const target = normOrg(companyName);
  if (!target) return [];
  const out: (Caller & { strength: number })[] = [];
  for (const c of network.contacts) {
    const stint = c.career.find((s) => {
      const o = normOrg(s.org);
      return o && (o === target || o.startsWith(target + " ") || target.startsWith(o + " "));
    });
    if (!stint) continue;
    const current = stint.span.endsWith("now");
    out.push({
      id: c.id,
      name: c.name,
      relation: current ? "current" : "former",
      org: stint.org,
      role: stint.role,
      span: stint.span,
      tie: c.tie.label,
      tieReasons: c.tie.reasons,
      angle: `${current ? "Inside view of" : "How it works inside"} ${companyName} (${stint.role}).`,
      caution: current ? "Works there now: keep it to background, avoid unpublished price-sensitive information." : null,
      strength: c.tie.strength,
    });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 4);
}

function toCard(f: Filing): StoryCard {
  const c = companies[f.symbol];
  const top = (network.who_to_call[f.symbol] ?? [])[0];
  const res = resultsFor(f);
  return {
    id: f.id,
    symbol: f.symbol,
    company: shortName(c?.name ?? f.company),
    filedAt: f.filed_at,
    tier: f.tier,
    score: f.score,
    category: f.category,
    categoryLabel: f.category_label,
    // A results story's headline is computed from the XBRL, not written by a model.
    headline: res?.headline || f.headline || f.title,
    summary: res ? null : (f.summary ?? null),
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
    eventContacts: f.tier === "routine" ? [] : (f.event_contacts ?? []),
    people: (f.people ?? []).filter((p) => p.change !== "reappointed"),
    results: res,
  };
}

/** A routine story only ever renders as a one-line title: ship just that (keeps the Brief light). */
function slimRoutine(s: StoryCard): StoryCard {
  return s.tier !== "routine"
    ? s
    : { ...s, summary: null, why: [], reaction: null, contact: null, eventContacts: [], people: [], results: null, url: null };
}

/** One card per story (the highest-scoring filing of each group), newest first. */
export function getStories(symbol?: string): StoryCard[] {
  return filings
    .filter((f) => f.story_id === f.id && (!symbol || f.symbol === symbol))
    .map(toCard)
    .map(slimRoutine)
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

/** Everything the alerts inbox needs, slimmed for the client (FR-09). */
export function getAlertInputs() {
  const prefs = preferencesJson as unknown as {
    alerts: { volume_multiple: number; volume_lookback_days: number; price_move_pct: number; categories: string[] };
  };
  const bars: Record<string, SlimBar[]> = {};
  for (const [sym, series] of Object.entries(prices)) {
    bars[sym] = series.slice(-90).map((b) => ({ d: b.date, c: b.close, v: b.volume }));
  }
  const slim: SlimFiling[] = filings
    .filter((f) => f.story_id === f.id && f.tier !== "routine")
    .map((f) => ({
      id: f.id,
      symbol: f.symbol,
      filedAt: f.filed_at,
      category: f.category,
      categoryLabel: f.category_label,
      headline: resultsFor(f)?.headline || f.headline || f.title,
      tier: f.tier,
    }));
  const companyMap: Record<string, AlertCompany> = {};
  for (const c of Object.values(companies)) {
    companyMap[c.symbol] = { symbol: c.symbol, name: shortName(c.name), inPortfolio: c.in_portfolio, weight: c.weight };
  }
  const labels: Record<string, string> = {
    results: "Results", "M&A": "M&A", management_change: "Management change", litigation: "Legal / regulatory",
    pledging: "Promoter pledge", fund_raise: "Fund raise", capex: "Capex", credit_rating: "Credit rating",
    insider_trading: "Insider trade", dividend: "Dividend",
  };
  return {
    bars,
    filings: slim,
    companies: companyMap,
    defaults: {
      volumeMultiple: prefs.alerts.volume_multiple,
      lookback: prefs.alerts.volume_lookback_days,
      priceMovePct: prefs.alerts.price_move_pct,
      categories: prefs.alerts.categories,
      includeWatchlist: true,
    } satisfies AlertSettings,
    categoryOptions: Object.entries(labels).map(([key, label]) => ({ key, label })),
    now: meta.generated_at,
  };
}

/** Day-over-day change on the last trading day. */
export function lastMove(symbol: string): { close: number; pct: number } | null {
  const b = prices[symbol];
  if (!b || b.length < 2) return null;
  const [prev, cur] = [b[b.length - 2], b[b.length - 1]];
  return { close: cur.close, pct: (cur.close / prev.close - 1) * 100 };
}
