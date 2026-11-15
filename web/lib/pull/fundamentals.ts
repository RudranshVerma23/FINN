// Fundamentals for any ticker: committed snapshot first (instant, NFR-01), live Screener otherwise (NFR-02).
// Server-side only (imported by server components and scripts, never by client components).

import snapshot from "@/data/fundamentals.json";

import { fetchFundamentals } from "./screener";
import type { Fundamentals } from "./types";

const known = snapshot as unknown as Record<string, Fundamentals>;

export function knownSymbols(): string[] {
  return Object.keys(known);
}

export async function getFundamentals(symbol: string): Promise<{ data: Fundamentals; source: "snapshot" | "live" }> {
  const sym = symbol.toUpperCase();
  if (known[sym]) return { data: known[sym], source: "snapshot" };
  return { data: await fetchFundamentals(sym), source: "live" };
}
