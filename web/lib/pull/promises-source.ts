// Where a "promised vs delivered" result comes from: the committed precompute (instant, works
// without an API key on the host) or a live run for any other ticker.
import { cacheLife } from "next/cache";
import { connection } from "next/server";

import precomputed from "@/data/pull.json";

import { getFundamentals } from "./fundamentals";
import { promisedVsDelivered, type PromisesResult } from "./promises";

const saved = precomputed as unknown as Record<string, PromisesResult>;

async function live(symbol: string): Promise<PromisesResult> {
  "use cache";
  cacheLife("days"); // reused within an instance; see ADR-36 for why this isn't the persistence layer
  const { data } = await getFundamentals(symbol);
  return promisedVsDelivered(data);
}

export type PromisesOutcome =
  | { kind: "ok"; result: PromisesResult; source: "precomputed" | "live" }
  | { kind: "no-transcripts" }
  | { kind: "no-key" }
  | { kind: "error"; message: string };

export async function getPromises(symbol: string): Promise<PromisesOutcome> {
  const sym = symbol.toUpperCase();
  if (saved[sym]) return { kind: "ok", result: saved[sym], source: "precomputed" };
  // Some companies (e.g. Trent) don't hold earnings calls: say so rather than call it an error.
  try {
    const { data } = await getFundamentals(sym);
    if (!data.documents.concalls.some((c) => c.transcript_url)) return { kind: "no-transcripts" };
  } catch {
    /* fall through: the live run will report the problem */
  }
  // Live model calls happen only for a real visitor, never while prerendering a build:
  // otherwise every deploy would spend ~5 calls per known ticker.
  await connection();
  if (!process.env.GEMINI_API_KEY) return { kind: "no-key" };
  try {
    return { kind: "ok", result: await live(sym), source: "live" };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}
