// Precompute "promised vs delivered" for chosen tickers into data/snapshot/pull.json, so the demo
// opens instantly and works even without an API key on the host (NFR-01, NFR-03). Any other ticker
// is computed live by the same code (lib/pull/promises.ts).
//
//   cd web && npx tsx --env-file=../.env scripts/precompute-pull.ts DEEPAKNTR TRENT ...
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getFundamentals } from "../lib/pull/fundamentals";
import { promisedVsDelivered } from "../lib/pull/promises";

const OUT = join(__dirname, "..", "..", "data", "snapshot", "pull.json");
process.env.FINN_LLM_CACHE_DIR ??= join(__dirname, "..", "..", "data", "llm_cache", "web");

async function main() {
  const symbols = process.argv.slice(2).map((s) => s.toUpperCase());
  const all: Record<string, unknown> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  for (const sym of symbols) {
    const t0 = Date.now();
    try {
      const { data } = await getFundamentals(sym);
      const r = await promisedVsDelivered(data);
      all[sym] = r;
      const tokens = r.usage.reduce((a, u) => a + u.input + u.output, 0);
      const tally = r.verdicts.reduce<Record<string, number>>((a, v) => ({ ...a, [v.verdict]: (a[v.verdict] ?? 0) + 1 }), {});
      console.log(
        `${sym.padEnd(11)} ${r.transcripts.map((t) => `${t.id}:${t.pages}p`).join(" ")}  guidance=${r.guidance.length} ` +
          `verdicts=${JSON.stringify(tally)} bull=${r.bull.length} bear=${r.bear.length} ` +
          `dropped=${r.dropped.quotes}q/${r.dropped.claims}c tokens=${tokens} ${((Date.now() - t0) / 1000).toFixed(0)}s`,
      );
    } catch (e) {
      console.log(`${sym.padEnd(11)} FAILED: ${(e as Error).message}`);
    }
    writeFileSync(OUT, JSON.stringify(all, null, 1));
  }
}

main();
