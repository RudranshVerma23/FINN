// Live Screener fetch + parse for tickers outside the committed snapshot (FR-11, NFR-02).
// Mirrors ingest/finn/sources/screener.py. We take Screener's TABLES (compiled from the
// company's own filings) and DOCUMENT LINKS; never its commentary or summaries (FR-16).
import "server-only";

import { parse, type HTMLElement } from "node-html-parser";

import type { Fundamentals, Table } from "./types";

const BASE = "https://www.screener.in";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "text/html,application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Client": "FINN research prototype (low volume)",
};
const DAY = 86400;

export class NotFound extends Error {}

function num(text: string): number | null {
  const t = text.replace(/[,%+]/g, "").trim();
  if (!t || t === "-" || t === "--") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseTable(section: HTMLElement | null): Table | null {
  const table = section?.querySelector("table");
  if (!table) return null;
  const periods = table.querySelectorAll("thead th").map((th) => th.text.trim()).slice(1);
  const rows: Table["rows"] = {};
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cells = tr.querySelectorAll("td");
    if (!cells.length) continue;
    let label = cells[0].text.replace(/\s+/g, " ").trim().replace(/\s*\+$/, "");
    if (label.startsWith("CFO/EBITDA")) label = "CFO/EBITDA";
    if (!label || label.toLowerCase().startsWith("raw pdf")) continue;
    rows[label] = cells.slice(1).map((td) => num(td.text));
  }
  return { periods, rows };
}

function parseDocuments(root: HTMLElement): Fundamentals["documents"] {
  const out: Fundamentals["documents"] = { annual_reports: [], concalls: [] };
  for (const block of root.querySelectorAll("section#documents div.documents")) {
    const heading = (block.querySelector("h3")?.text ?? "").trim().toLowerCase();
    if (heading.startsWith("annual report")) {
      for (const a of block.querySelectorAll("li a")) {
        const m = a.text.match(/(\d{4})/);
        out.annual_reports.push({ year: m ? Number(m[1]) : null, url: a.getAttribute("href") ?? "" });
      }
    } else if (heading.startsWith("concall")) {
      for (const li of block.querySelectorAll("li")) {
        const m = li.text.replace(/\s+/g, " ").match(/\b([A-Z][a-z]{2}) (\d{4})\b/);
        const month = m ? `${m[2]}-${String(new Date(`${m[1]} 1, 2000`).getMonth() + 1).padStart(2, "0")}` : null;
        const links: Record<string, string> = {};
        for (const a of li.querySelectorAll("a")) {
          const href = a.getAttribute("href");
          if (href) links[a.text.trim().toLowerCase()] = href;
        }
        out.concalls.push({
          month,
          transcript_url: links["transcript"] ?? null,
          presentation_url: links["ppt"] ?? null,
          recording_url: links["rec"] ?? null,
        });
      }
    }
  }
  return out;
}

async function getHtml(url: string): Promise<string | null> {
  // The fetch cache persists across serverless requests (unlike in-memory `use cache`).
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: DAY } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Screener returned ${res.status}`);
  return res.text();
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const sym = symbol.toUpperCase();
  for (const view of ["consolidated/", ""]) {
    const url = `${BASE}/company/${encodeURIComponent(sym)}/${view}`;
    const html = await getHtml(url);
    if (!html) continue;
    const root = parse(html);
    const tables = {
      quarters: parseTable(root.querySelector("section#quarters")),
      profit_loss: parseTable(root.querySelector("section#profit-loss")),
      balance_sheet: parseTable(root.querySelector("section#balance-sheet")),
      cash_flow: parseTable(root.querySelector("section#cash-flow")),
      ratios: parseTable(root.querySelector("section#ratios")),
    };
    const thin = !tables.quarters || !Object.keys(tables.quarters.rows).length || !tables.profit_loss?.periods.length;
    if (view && thin) continue; // no consolidated history: use standalone
    const top: Record<string, string> = {};
    for (const li of root.querySelectorAll("#top-ratios li")) {
      const n = li.querySelector(".name")?.text.replace(/\s+/g, " ").trim();
      const v = li.querySelector(".value")?.text.replace(/\s+/g, " ").trim();
      if (n && v) top[n] = v;
    }
    const bse = root
      .querySelectorAll("a")
      .map((a) => a.getAttribute("href") ?? "")
      .find((h) => /bseindia\.com\/stock-share-price/.test(h))
      ?.match(/\/(\d{6})\//)?.[1];
    return {
      symbol: sym,
      name: root.querySelector("h1")?.text.trim() || sym,
      bse_code: bse ?? null,
      view: view ? "consolidated" : "standalone",
      source_url: url,
      top_ratios: top,
      tables,
      documents: parseDocuments(root),
    };
  }
  throw new NotFound(`No Screener page for ${sym}`);
}

export async function searchCompanies(q: string): Promise<{ name: string; symbol: string }[]> {
  const res = await fetch(`${BASE}/api/company/search/?q=${encodeURIComponent(q)}`, {
    headers: { ...HEADERS, Accept: "application/json" },
    next: { revalidate: DAY },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as { name: string; url: string }[];
  return rows
    .map((r) => ({ name: r.name, symbol: r.url.match(/^\/company\/([^/]+)\//)?.[1] ?? "" }))
    .filter((r) => r.symbol && !/^\d+$/.test(r.symbol)); // numeric = BSE-only code, not an NSE ticker
}
