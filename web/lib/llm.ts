// The web app's one door to an LLM. Mirrors ingest/finn/llm.py:
//   - model routing from config/models.json (synced to web/data/models.json), tiers with fallback chains
//   - JSON output against a schema, temperature 0
//   - content-hash cache: in memory always; on disk too when FINN_LLM_CACHE_DIR is set (scripts)
//   - usage recorded per call so the UI can say what a result cost
// Privacy (NFR-05): callers pass public documents only, never network data.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GoogleGenAI } from "@google/genai";

import models from "@/data/models.json";

export type Tier = "bulk" | "reasoning";

export interface Usage {
  label: string;
  model: string;
  input: number;
  output: number;
  cached: boolean;
  ms?: number;
}

// Extraction doesn't need the model to deliberate; comparison does, but within a budget.
// Unbounded thinking made one comparison take ~170s (see docs/architecture.md).
const THINKING: Record<Tier, { thinkingBudget: number } | undefined> = {
  bulk: { thinkingBudget: 0 },
  reasoning: { thinkingBudget: 2048 },
};

const TIERS = (models as { tiers: Record<Tier, string[]> }).tiers;
const memo = new Map<string, { output: unknown; model: string }>();
let client: GoogleGenAI | null = null;

export class LlmUnavailable extends Error {}

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmUnavailable("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

function status(e: unknown): number | undefined {
  const err = e as { status?: number; code?: number };
  return err?.status ?? err?.code;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function ask<T>(
  prompt: string,
  tier: Tier,
  opts: { system: string; schema: object; label: string },
  usage?: Usage[],
): Promise<T> {
  const key = createHash("sha256").update(JSON.stringify([tier, opts.system, opts.schema, prompt])).digest("hex");
  const dir = process.env.FINN_LLM_CACHE_DIR;
  const file = dir ? join(dir, `${key}.json`) : null;

  const hit = memo.get(key) ?? (file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
  if (hit) {
    usage?.push({ label: opts.label, model: hit.model, input: 0, output: 0, cached: true });
    return hit.output as T;
  }

  let last: unknown;
  for (const model of TIERS[tier]) {
    let thinking = THINKING[tier];
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const res = await getClient().models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0,
            systemInstruction: opts.system,
            responseMimeType: "application/json",
            responseJsonSchema: opts.schema,
            ...(thinking ? { thinkingConfig: thinking } : {}),
          },
        });
        if (!res.text) throw new Error(`${model} returned no text`);
        const output = JSON.parse(res.text) as T;
        const entry = { output, model };
        memo.set(key, entry);
        if (dir && file) {
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, JSON.stringify(entry));
        }
        usage?.push({
          label: opts.label,
          model,
          input: res.usageMetadata?.promptTokenCount ?? 0,
          output: res.usageMetadata?.candidatesTokenCount ?? 0,
          cached: false,
          ms: Date.now() - t0,
        });
        return output;
      } catch (e) {
        last = e;
        if (e instanceof LlmUnavailable) throw e;
        const s = status(e);
        if (s === 400 && thinking) {
          thinking = undefined; // this model doesn't accept a thinking budget: retry without it
          attempt--;
          continue;
        }
        if (s === 429 || s === 404) break; // quota spent or model retired: next model in the chain
        if (s === 503 && attempt === 0) break; // overloaded: don't queue behind it, try the next model
        if (s && ![500, 502, 503, 504].includes(s)) throw e;
        await sleep(2000 * (attempt + 1));
      }
    }
  }
  throw new Error(`All ${tier} models failed: ${String(last)}`);
}
