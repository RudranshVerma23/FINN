// The Ask bar (FR-25). The model is a ROUTER, not a reader: it turns the investor's question into
// a structured query; code answers it from the snapshot and the network. No network data is ever
// sent to the model (NFR-05), only the question and the public list of companies.
import "server-only";

import { getCallers, getCompanies, getReconnect, getResults, getStories, shortName } from "./data";
import { ask, LlmUnavailable } from "./llm";
import { findExperts, getPeople } from "./people";
import { searchCompanies } from "./pull/screener";

export type Intent = "experts" | "who_to_call" | "company_news" | "results" | "research" | "person" | "reconnect" | "unknown";

export interface Route {
  intent: Intent;
  symbol?: string | null;
  company_name?: string | null;
  theme?: string | null;
  person_name?: string | null;
  days?: number | null;
}

export interface AnswerItem {
  title: string;
  subtitle?: string;
  href?: string;
}

export interface Answer {
  intent: Intent;
  title: string;
  items: AnswerItem[];
  empty?: string;
  routedBy: "model" | "keywords";
}

const ROUTER_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["experts", "who_to_call", "company_news", "results", "research", "person", "reconnect", "unknown"] },
    symbol: { type: ["string", "null"] },
    company_name: { type: ["string", "null"] },
    theme: { type: ["string", "null"] },
    person_name: { type: ["string", "null"] },
    days: { type: ["integer", "null"] },
  },
  required: ["intent", "symbol", "company_name", "theme", "person_name", "days"],
};

function routerSystem(): string {
  const list = getCompanies().map((c) => `${c.symbol}=${shortName(c.name)}`).join("; ");
  return `Route an investor's question to one intent. Do not answer it.
Intents:
- experts: who in my network knows a theme/sector/topic. Set theme (2-3 words, e.g. "semiconductors", "rural lending").
- who_to_call: who I know at / around a company. Set symbol if it is one of the known companies, else company_name.
- company_news: what happened / changed at a company recently. Set symbol or company_name, days if stated.
- results: a company's latest quarterly numbers. Set symbol or company_name.
- research: analyse / research / deep dive on a company. Set symbol or company_name.
- person: tell me about a named person in my network. Set person_name.
- reconnect: who should I reconnect with / catch up with.
- unknown: anything else.
Known companies (NSE symbol=name): ${list}.`;
}

/** Keyword routing: the fallback when no model is configured or it fails. */
function keywordRoute(q: string): Route {
  const s = q.toLowerCase();
  const company = getCompanies().find(
    (c) => s.includes(c.symbol.toLowerCase()) || s.includes(shortName(c.name).toLowerCase().split(" ").slice(0, 2).join(" ")),
  );
  const symbol = company?.symbol ?? null;
  if (/reconnect|catch up|haven'?t spoken/.test(s)) return { intent: "reconnect" };
  if (/who (knows|understands)|expert|go-?to/.test(s)) {
    const theme = s.replace(/.*(knows|understands|expert[s]? (on|in)|go-?to (people|person) (for|on))\s*(about\s*)?/, "").replace(/[?.!]/g, "").trim();
    return { intent: "experts", theme };
  }
  if (/who (should i|can i|do i) (call|ask|know)|who to call/.test(s) && symbol) return { intent: "who_to_call", symbol };
  if (/result|quarter|q[1-4]|revenue|profit|pat\b/.test(s) && symbol) return { intent: "results", symbol };
  if (/research|analy|deep dive|promised|bull|bear/.test(s) && symbol) return { intent: "research", symbol };
  if (symbol) return { intent: "company_news", symbol };
  const person = getPeople().find((p) => s.includes(p.name.toLowerCase()) || s.includes(p.name.split(" ")[0].toLowerCase()));
  if (person) return { intent: "person", person_name: person.name };
  return { intent: "unknown" };
}

async function resolveSymbol(r: Route): Promise<{ symbol: string; name: string } | null> {
  const known = getCompanies();
  const bySym = r.symbol ? known.find((c) => c.symbol === r.symbol!.toUpperCase()) : undefined;
  if (bySym) return { symbol: bySym.symbol, name: shortName(bySym.name) };
  const q = r.company_name || r.symbol;
  if (!q) return null;
  const byName = known.find((c) => shortName(c.name).toLowerCase().includes(q.toLowerCase()));
  if (byName) return { symbol: byName.symbol, name: shortName(byName.name) };
  try {
    const hit = (await searchCompanies(q))[0];
    return hit ? { symbol: hit.symbol, name: hit.name.replace(/\s+Ltd\.?$/, "") } : null;
  } catch {
    return null;
  }
}

export async function answer(question: string): Promise<Answer> {
  let route: Route;
  let routedBy: Answer["routedBy"] = "model";
  try {
    route = await ask<Route>(`Question: ${question}`, "bulk", { system: routerSystem(), schema: ROUTER_SCHEMA, label: "ask-route" });
  } catch (e) {
    if (!(e instanceof LlmUnavailable)) console.warn("ask router failed, using keywords", e);
    route = keywordRoute(question);
    routedBy = "keywords";
  }

  switch (route.intent) {
    case "experts": {
      const theme = route.theme?.trim() || question;
      const hits = findExperts(theme);
      return {
        intent: "experts", routedBy, title: `Your go-to people on ${theme}`,
        items: hits.map((h) => ({ title: h.contact.name, subtitle: `${h.because} · ${h.contact.tie.label} tie`, href: `/p/${h.contact.id}` })),
        empty: `No one in your network lists ${theme} as an area of expertise.`,
      };
    }
    case "who_to_call": {
      const co = await resolveSymbol(route);
      if (!co) break;
      const callers = getCallers(co.symbol, co.name);
      return {
        intent: "who_to_call", routedBy, title: `Who to call about ${co.name}`,
        items: callers.map((c) => ({ title: c.name, subtitle: `${c.angle} · ${c.tie} tie`, href: `/p/${c.id}` })),
        empty: `No one in your network has worked at ${co.name} or around it.`,
      };
    }
    case "company_news": {
      const co = await resolveSymbol(route);
      if (!co) break;
      // Latest material stories (the snapshot covers the last 30 days).
      const stories = getStories(co.symbol)
        .filter((s) => s.tier !== "routine")
        .sort((a, b) => b.score - a.score) // what matters first, not what was filed last
        .slice(0, 5);
      if (!getCompanies().some((c) => c.symbol === co.symbol)) {
        // FINN doesn't track this company's filings; its research view works for any ticker.
        return { intent: "company_news", routedBy, title: co.name, items: [{ title: `Research ${co.name} →`, href: `/r/${co.symbol}` }] };
      }
      return {
        intent: "company_news", routedBy, title: `What changed at ${co.name}`,
        items: stories.map((s) => ({ title: s.headline, subtitle: `${s.categoryLabel} · ${s.filedAt.slice(0, 10)}`, href: `/c/${encodeURIComponent(co.symbol)}` })),
        empty: `Nothing material from ${co.name} in the last 30 days.`,
      };
    }
    case "results": {
      const co = await resolveSymbol(route);
      if (!co) break;
      const r = getResults(co.symbol);
      if (!r) return { intent: "results", routedBy, title: co.name, items: [{ title: `Research ${co.name} →`, href: `/r/${co.symbol}` }] };
      return {
        intent: "results", routedBy, title: `${co.name}: ${r.quarter}`,
        items: r.lines.filter((l) => l.value !== null).map((l) => ({
          title: `${l.label}: ₹${Math.round(l.value!).toLocaleString("en-IN")} cr`,
          subtitle: `QoQ ${l.qoq_pct ?? "—"}% · YoY ${l.yoy_pct ?? "—"}%`,
          href: `/c/${encodeURIComponent(co.symbol)}`,
        })),
      };
    }
    case "research": {
      const co = await resolveSymbol(route);
      if (!co) break;
      return { intent: "research", routedBy, title: `Research ${co.name}`, items: [{ title: `Open ${co.symbol} research →`, subtitle: "Numbers, trajectory, promised vs delivered, bull vs bear", href: `/r/${co.symbol}` }] };
    }
    case "person": {
      const name = (route.person_name ?? "").toLowerCase();
      const people = getPeople().filter((p) => name && (p.name.toLowerCase().includes(name) || name.includes(p.name.split(" ")[0].toLowerCase())));
      return {
        intent: "person", routedBy, title: route.person_name ?? "Person",
        items: people.map((p) => ({ title: p.name, subtitle: `${p.current?.role ?? p.headline} · ${p.tie.label} tie`, href: `/p/${p.id}` })),
        empty: "No one by that name in your network.",
      };
    }
    case "reconnect":
      return {
        intent: "reconnect", routedBy, title: "Reasons to reconnect",
        items: getReconnect().map((r) => ({ title: r.name, subtitle: `${shortName(r.company)}: ${r.headline}`, href: `/p/${r.person_id}` })),
      };
  }
  return {
    intent: "unknown", routedBy, title: "FINN can answer questions like these", items: [
      { title: "Who knows semiconductors?" },
      { title: "Who should I call about Tata Power?" },
      { title: "What changed at PI Industries?" },
      { title: "Research Astral" },
    ],
  };
}
