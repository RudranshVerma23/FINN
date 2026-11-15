// Promised vs delivered, and bull vs bear, grounded in primary sources only (FR-14, FR-15, FR-16).
//
//   1. Read the last four earnings-call transcripts page by page (exchange-hosted PDFs).
//   2. Bulk model, one call per transcript: extract explicit guidance (plus notable risks and
//      positives) with a VERBATIM quote and page number. Every quote is checked against the page
//      text in code; an item whose quote isn't there is dropped.
//   3. Build the actuals in code from the company's quarterly and annual numbers (A-ids).
//   4. Reasoning model: compare guidance (G-ids) with actuals (A-ids); write a bull and a bear
//      case. It may only cite the ids it was given.
//   5. Validator: every verdict and every bull/bear point must cite ids that exist; verdicts that
//      claim met/missed must cite an actual. Anything else is dropped and counted.
import { extractText, getDocumentProxy } from "unpdf";

import { ask, type Usage } from "../llm";
import type { Fundamentals } from "./types";

export interface TranscriptRef {
  id: string; // T1 = most recent
  month: string | null;
  url: string;
  pages: number;
}

export interface GuidanceItem {
  id: string; // G1..
  transcript: string; // T-id
  kind: "guidance" | "risk" | "positive";
  metric: string;
  period: string;
  statement: string;
  quote: string;
  page: number;
}

export interface Actual {
  id: string; // A1..
  text: string;
}

export interface Verdict {
  metric: string;
  promise: string;
  delivered: string;
  verdict: "met" | "missed" | "partly" | "on_track" | "off_track" | "too_early" | "unclear";
  guidance_ids: string[];
  actual_ids: string[];
}

export interface CasePoint {
  point: string;
  ids: string[];
}

export interface PromisesResult {
  symbol: string;
  generated_at: string;
  transcripts: TranscriptRef[];
  guidance: GuidanceItem[];
  actuals: Actual[];
  verdicts: Verdict[];
  scorecard: string | null;
  bull: CasePoint[];
  bear: CasePoint[];
  dropped: { quotes: number; claims: number };
  usage: Usage[];
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_CHARS = 110_000; // ~27k tokens per transcript; long calls are mostly Q&A repetition after this

export class NoTranscripts extends Error {}

async function readPdf(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/", Accept: "application/pdf" },
    next: { revalidate: 7 * 86400 },
  });
  if (!res.ok) throw new Error(`transcript ${res.status}`);
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).map((t) => t.replace(/\s+/g, " ").trim());
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();

/** Is the quote really on that page (or the next, for quotes that run over a page break)? */
export function quoteOnPage(quote: string, pages: string[], page: number): boolean {
  const q = norm(quote);
  if (q.length < 12) return false;
  const text = norm([pages[page - 1] ?? "", pages[page] ?? ""].join(" "));
  if (text.includes(q)) return true;
  // tolerate small transcription differences: 90% of the quote's words, in the page
  const words = q.split(" ").filter((w) => w.length >= 4);
  if (words.length < 4) return false;
  const found = words.filter((w) => text.includes(w)).length;
  return found / words.length >= 0.9;
}

// ------------------------------------------------------------------ extraction (bulk)

const EXTRACT_SYSTEM = `You read Indian listed companies' earnings-call transcripts for an investor.
Use ONLY the transcript. Never add outside knowledge.
Extract up to 10 items:
- "guidance": explicit forward-looking statements by MANAGEMENT about measurable things: revenue or volume
  growth, margins, capex, capacity, order book, debt, launches with dates. Must name a number or a clear direction
  and a period. Not analysts' questions, not hopes without substance.
- "risk": up to 3 problems management acknowledged (pricing pressure, delays, losses, regulatory issues).
- "positive": up to 3 concrete strengths management reported (record order book, new customers, capacity coming on).
For each item give: kind, metric (2-4 words), period (e.g. "FY27", "H2 FY27", "next 2-3 years"),
statement (paraphrase, at most 25 words), quote (an EXACT contiguous sentence or phrase copied from the
transcript, 8-40 words, no ellipses), page (the [p.N] page the quote is on).`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["guidance", "risk", "positive"] },
          metric: { type: "string" },
          period: { type: "string" },
          statement: { type: "string" },
          quote: { type: "string" },
          page: { type: "integer" },
        },
        required: ["kind", "metric", "period", "statement", "quote", "page"],
      },
    },
  },
  required: ["items"],
};

// ------------------------------------------------------------------ actuals (code)

const MONTHS: Record<string, number> = { Mar: 3, Jun: 6, Sep: 9, Dec: 12 };

function quarterName(period: string): string {
  const [mon, yr] = period.split(" ");
  const m = MONTHS[mon];
  if (!m) return period;
  const y = Number(yr);
  const fy = m > 3 ? y + 1 : y;
  const q = { 6: 1, 9: 2, 12: 3, 3: 4 }[m as 3 | 6 | 9 | 12];
  return `Q${q} FY${String(fy).slice(2)} (${period})`;
}

const cr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")} cr`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function buildActuals(f: Fundamentals): Actual[] {
  const out: Actual[] = [];
  const q = f.tables.quarters;
  if (q) {
    const rev = q.rows["Sales"] ?? q.rows["Revenue"];
    const opm = q.rows["OPM %"] ?? q.rows["Financing Margin %"];
    const np = q.rows["Net Profit"];
    const tax = q.rows["Tax %"];
    const n = q.periods.length;
    for (let i = Math.max(4, n - 6); i < n; i++) {
      const parts: string[] = [];
      if (rev?.[i] != null) {
        parts.push(`revenue ${cr(rev[i]!)}`);
        if (rev[i - 4] != null && rev[i - 4]! > 0) parts.push(`YoY ${pct((rev[i]! / rev[i - 4]! - 1) * 100)}`);
        if (rev[i - 1] != null && rev[i - 1]! > 0) parts.push(`QoQ ${pct((rev[i]! / rev[i - 1]! - 1) * 100)}`);
      }
      if (opm?.[i] != null) parts.push(`operating margin ${opm[i]}%`);
      if (np?.[i] != null) {
        parts.push(`net profit ${cr(np[i]!)}`);
        if (np[i - 4] != null && np[i - 4]! > 0) parts.push(`profit YoY ${pct((np[i]! / np[i - 4]! - 1) * 100)}`);
      }
      if (tax?.[i] != null) parts.push(`tax rate ${tax[i]}%`);
      if (parts.length) out.push({ id: "", text: `${quarterName(q.periods[i])}: ${parts.join(", ")}` });
    }
  }
  const pl = f.tables.profit_loss;
  if (pl) {
    const rev = pl.rows["Sales"] ?? pl.rows["Revenue"];
    const opm = pl.rows["OPM %"];
    const fy = pl.periods.map((p, i) => (/^Mar \d{4}$/.test(p) ? i : -1)).filter((i) => i >= 0).slice(-2);
    for (const i of fy) {
      const parts = [];
      if (rev?.[i] != null) parts.push(`revenue ${cr(rev[i]!)}`);
      if (rev?.[i - 1] != null && rev[i - 1]! > 0 && rev?.[i] != null) parts.push(`growth ${pct((rev[i]! / rev[i - 1]! - 1) * 100)}`);
      if (opm?.[i] != null) parts.push(`operating margin ${opm[i]}%`);
      out.push({ id: "", text: `FY${pl.periods[i].slice(-2)} (full year to ${pl.periods[i]}): ${parts.join(", ")}` });
    }
  }
  const bs = f.tables.balance_sheet;
  if (bs?.rows["Borrowings"]) {
    const b = bs.rows["Borrowings"];
    const last = b.length - 1;
    out.push({ id: "", text: `Borrowings: ${cr(b[last] ?? 0)} at ${bs.periods[last]}, ${cr(b[last - 1] ?? 0)} at ${bs.periods[last - 1]}` });
  }
  return out.map((a, i) => ({ ...a, id: `A${i + 1}` }));
}

// ------------------------------------------------------------------ comparison (reasoning)

const COMPARE_SYSTEM = `You are an equity analyst checking whether management delivered what it promised.
Use ONLY the guidance items (G-ids) and actuals (A-ids) given. Never use outside knowledge, news or memory
of the company. Cite ids exactly as given.
1. verdicts: pick up to 6 of the most important MEASURABLE guidance items. For each:
   metric; promise (at most 20 words, what was promised and when); delivered (at most 25 words, using the numbers
   in the cited actuals); verdict, one of:
     "met" / "missed" / "partly": the period has ended and actuals cover it;
     "on_track" / "off_track": the period is still running but actuals already cover part of it, so judge the
       direction (e.g. "positive growth in FY27" against H1 revenue -10% YoY is "off_track");
     "too_early": no actual covers any of the period yet;
     "unclear": the actuals given can't measure it (e.g. capex, segment revenue, tax rate).
   guidance_ids; actual_ids. Every verdict except "too_early" and "unclear" REQUIRES at least one actual id.
   Prefer items you can judge: an analyst wants to know who delivered, not a list of pending plans.
   Be strict: missing the low end of a range is "missed".
2. scorecard: one sentence (at most 25 words) on management's track record across these items.
3. bull: 3 points, bear: 3 points, each at most 25 words, each citing at least one G- or A-id in "ids".
   Make them specific (numbers, names), not generic ("strong management", "macro risks").
Never write ids like (G3) or A5 inside any text field: ids go only in the id arrays.`;

const COMPARE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metric: { type: "string" },
          promise: { type: "string" },
          delivered: { type: "string" },
          verdict: { type: "string", enum: ["met", "missed", "partly", "on_track", "off_track", "too_early", "unclear"] },
          guidance_ids: { type: "array", items: { type: "string" } },
          actual_ids: { type: "array", items: { type: "string" } },
        },
        required: ["metric", "promise", "delivered", "verdict", "guidance_ids", "actual_ids"],
      },
    },
    scorecard: { type: "string" },
    bull: {
      type: "array",
      items: { type: "object", properties: { point: { type: "string" }, ids: { type: "array", items: { type: "string" } } }, required: ["point", "ids"] },
    },
    bear: {
      type: "array",
      items: { type: "object", properties: { point: { type: "string" }, ids: { type: "array", items: { type: "string" } } }, required: ["point", "ids"] },
    },
  },
  required: ["verdicts", "scorecard", "bull", "bear"],
};

function monthName(m: string | null): string {
  if (!m) return "an earlier call";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

// ------------------------------------------------------------------ pipeline

export async function promisedVsDelivered(f: Fundamentals, opts: { transcripts?: number } = {}): Promise<PromisesResult> {
  const usage: Usage[] = [];
  const calls = f.documents.concalls.filter((c) => c.transcript_url).slice(0, opts.transcripts ?? 4);
  if (!calls.length) throw new NoTranscripts(`No earnings-call transcripts listed for ${f.symbol}`);

  // 1-2. read + extract, transcripts in parallel (independent calls)
  let droppedQuotes = 0;
  const read = await Promise.all(
    calls.map(async (c, i) => {
      const id = `T${i + 1}`;
      let pages: string[] = [];
      try {
        pages = await readPdf(c.transcript_url!);
      } catch {
        return { ref: { id, month: c.month, url: c.transcript_url!, pages: 0 }, items: [] as GuidanceItem[] };
      }
      let budget = MAX_CHARS;
      const body = pages
        .map((p, k) => {
          const chunk = budget > 0 ? p.slice(0, budget) : "";
          budget -= chunk.length;
          return chunk ? `[p.${k + 1}] ${chunk}` : "";
        })
        .filter(Boolean)
        .join("\n");
      const res = await ask<{ items: Omit<GuidanceItem, "id" | "transcript">[] }>(
        `Company: ${f.name} (${f.symbol}). Earnings call of ${monthName(c.month)}.\n\nTranscript:\n${body}`,
        "bulk",
        { system: EXTRACT_SYSTEM, schema: EXTRACT_SCHEMA, label: `extract ${id}` },
        usage,
      );
      const items: GuidanceItem[] = [];
      for (const it of res.items ?? []) {
        if (quoteOnPage(it.quote, pages, it.page)) items.push({ ...it, id: "", transcript: id });
        else droppedQuotes++;
      }
      return { ref: { id, month: c.month, url: c.transcript_url!, pages: pages.length }, items };
    }),
  );

  const transcripts = read.map((r) => r.ref);
  const guidance = read.flatMap((r) => r.items).map((g, i) => ({ ...g, id: `G${i + 1}` }));
  const actuals = buildActuals(f);

  const empty: PromisesResult = {
    symbol: f.symbol,
    generated_at: new Date().toISOString(),
    transcripts,
    guidance,
    actuals,
    verdicts: [],
    scorecard: null,
    bull: [],
    bear: [],
    dropped: { quotes: droppedQuotes, claims: 0 },
    usage,
  };
  if (!guidance.length) return empty;

  // 4. compare
  const when = Object.fromEntries(transcripts.map((t) => [t.id, monthName(t.month)]));
  const gText = guidance
    .map((g) => `${g.id} [${g.kind}, ${when[g.transcript]} call] ${g.metric} / ${g.period}: ${g.statement}`)
    .join("\n");
  const aText = actuals.map((a) => `${a.id} ${a.text}`).join("\n");
  const cmp = await ask<{ verdicts: Verdict[]; scorecard: string; bull: CasePoint[]; bear: CasePoint[] }>(
    `Company: ${f.name} (${f.symbol}).\n\nGuidance and commentary from earnings calls:\n${gText}\n\nActuals (from filings):\n${aText}`,
    "reasoning",
    { system: COMPARE_SYSTEM, schema: COMPARE_SCHEMA, label: "compare" },
    usage,
  );

  // 5. validate citations (and strip any ids the model wrote into prose anyway)
  const stripIds = (s: string) => s.replace(/\s*\((?:\s*[GA]\d+\s*,?\s*)+\)/g, "").trim();
  for (const v of cmp.verdicts ?? []) {
    v.promise = stripIds(v.promise);
    v.delivered = stripIds(v.delivered);
  }
  for (const p of [...(cmp.bull ?? []), ...(cmp.bear ?? [])]) p.point = stripIds(p.point);
  const gIds = new Set(guidance.map((g) => g.id));
  const aIds = new Set(actuals.map((a) => a.id));
  let droppedClaims = 0;
  const verdicts = (cmp.verdicts ?? []).filter((v) => {
    const g = v.guidance_ids.filter((id) => gIds.has(id));
    const a = v.actual_ids.filter((id) => aIds.has(id));
    const needsActual = ["met", "missed", "partly", "on_track", "off_track"].includes(v.verdict);
    const ok = g.length > 0 && (!needsActual || a.length > 0);
    if (!ok) droppedClaims++;
    v.guidance_ids = g;
    v.actual_ids = a;
    return ok;
  });
  const validPoints = (pts: CasePoint[]) =>
    (pts ?? []).filter((p) => {
      p.ids = p.ids.filter((id) => gIds.has(id) || aIds.has(id));
      if (!p.ids.length) droppedClaims++;
      return p.ids.length > 0;
    });

  return {
    ...empty,
    verdicts,
    scorecard: cmp.scorecard?.trim() || null,
    bull: validPoints(cmp.bull).slice(0, 3),
    bear: validPoints(cmp.bear).slice(0, 3),
    dropped: { quotes: droppedQuotes, claims: droppedClaims },
  };
}
