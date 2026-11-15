import Link from "next/link";
import { Suspense } from "react";

import { getCompany } from "@/lib/data";
import { analyse, crore } from "@/lib/pull/analysis";
import { getFundamentals } from "@/lib/pull/fundamentals";
import { NotFound } from "@/lib/pull/screener";
import type { Signal } from "@/lib/pull/types";

import { CashVsProfit, MiniBars, MiniLine } from "./mini-chart";
import { PromisesProgress, PromisesView } from "./promises-view";

const TONE: Record<Signal["tone"], string> = { up: "bg-up", down: "bg-down", neutral: "bg-muted" };

function monthLabel(m: string | null): string {
  if (!m) return "Concall";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/** The Pull research view for any NSE ticker (FR-11, FR-12, FR-13). Async: streamed under Suspense. */
export async function ResearchView({ symbol }: { symbol: string }) {
  let result;
  try {
    result = await getFundamentals(symbol);
  } catch (e) {
    return (
      <div className="mt-6 rounded-[18px] border border-hairline bg-surface p-4 text-[14px] leading-snug text-ink-2">
        {e instanceof NotFound ? (
          <>
            FINN couldn&apos;t find <span className="font-mono font-semibold text-ink">{symbol}</span> on Screener. Check the NSE
            symbol, or{" "}
            <Link href="/research" className="font-medium text-ink underline underline-offset-2">
              search by company name
            </Link>
            .
          </>
        ) : (
          <>Screener didn&apos;t respond just now, so FINN can&apos;t read {symbol}&apos;s filings. Try again in a minute.</>
        )}
      </div>
    );
  }

  const { data: f, source } = result;
  const a = analyse(f);
  const held = getCompany(f.symbol);
  const t = a.trajectory;
  const transcripts = f.documents.concalls.filter((c) => c.transcript_url).slice(0, 4);
  const reports = f.documents.annual_reports.slice(0, 3);

  return (
    <>
      <header className="mt-1">
        <p className="font-mono text-[13px] font-semibold">{f.symbol}</p>
        <h1 className="font-serif text-[30px] leading-[1.1] tracking-[-0.02em]">{f.name.replace(/\s+Ltd\.?$/, "")}</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {[a.price && `${a.price}`, a.marketCap && `Mkt cap ${a.marketCap}`, f.view].filter(Boolean).join(" · ")}
        </p>
        {held ? (
          <Link href={`/c/${encodeURIComponent(f.symbol)}`} className="mt-2 inline-block rounded-full bg-people-soft px-3 py-1 text-[12px] text-ink">
            {held.in_portfolio ? `In your portfolio · ${held.weight}%` : "On your watchlist"} · filings &amp; people →
          </Link>
        ) : null}
      </header>

      <section aria-label="At a glance" className="mt-5 grid grid-cols-2 gap-2">
        {a.tiles.map((tile) => (
          <div key={tile.label} className="rounded-[16px] border border-hairline bg-surface p-3">
            <p className="text-[11.5px] text-muted">{tile.label}</p>
            <p
              className={`tabular mt-0.5 font-mono text-[18px] ${tile.tone === "down" ? "text-down" : tile.tone === "up" ? "text-ink" : "text-ink"}`}
            >
              {tile.value}
            </p>
            {tile.sub ? <p className="mt-0.5 text-[11px] leading-snug text-muted">{tile.sub}</p> : null}
          </div>
        ))}
      </section>

      {t.years.length >= 3 ? (
        <section aria-label="Trajectory" className="mt-6">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Trajectory · {t.years.length} years</h2>
          <div className="mt-2 grid grid-cols-1 gap-4 rounded-[18px] border border-hairline bg-surface p-4">
            <MiniBars label="Revenue" years={t.years} values={t.revenue} format={(v) => crore(v)} />
            <MiniBars label="Net profit" years={t.years} values={t.profit} format={(v) => crore(v)} />
            <MiniLine label={a.marginLabel} years={t.years} values={t.margin} />
          </div>
        </section>
      ) : null}

      {a.signals.length ? (
        <section aria-label="What the numbers say" className="mt-6">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">What the numbers say</h2>
          <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
            {a.signals.map((s) => (
              <li key={s.kind} className="flex gap-3 px-4 py-3">
                <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TONE[s.tone]}`} aria-hidden />
                <div>
                  <p className="text-[14px] leading-snug text-ink">{s.text}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{s.source}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Promised vs delivered" className="mt-6">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Promised vs delivered</h2>
        <Suspense fallback={<PromisesProgress />}>
          <PromisesView symbol={f.symbol} />
        </Suspense>
      </section>

      {a.cash && a.cash.years.length >= 3 ? (
        <section aria-label="Cash versus profit" className="mt-6">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Do profits turn into cash?</h2>
          <div className="mt-2 rounded-[18px] border border-hairline bg-surface p-4">
            <CashVsProfit years={a.cash.years} cfo={a.cash.cfo} profit={a.cash.profit} />
          </div>
        </section>
      ) : null}

      <section aria-label="Primary sources" className="mt-6">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Primary sources</h2>
        <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface text-[13.5px]">
          {transcripts.map((c) => (
            <li key={c.transcript_url!}>
              <a href={c.transcript_url!} target="_blank" rel="noreferrer" className="flex justify-between px-4 py-2.5">
                <span>Earnings call transcript</span>
                <span className="text-muted">{monthLabel(c.month)} ↗</span>
              </a>
            </li>
          ))}
          {reports.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer" className="flex justify-between px-4 py-2.5">
                <span>Annual report</span>
                <span className="text-muted">{r.year} ↗</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-[11.5px] leading-snug text-muted">
          Numbers are from {f.symbol}&apos;s own filings as compiled by Screener ({f.view},{" "}
          {source === "snapshot" ? "saved snapshot" : "fetched just now"}). No news, broker notes or model background knowledge.
        </p>
      </section>
    </>
  );
}

export function ResearchProgress({ symbol }: { symbol: string }) {
  const steps = [`Resolving ${symbol}`, "Fetching its filings tables", "Computing trajectory, margins, cash and debt"];
  return (
    <div className="mt-6 space-y-3" role="status" aria-live="polite">
      <p className="font-serif text-[24px] leading-tight">Reading {symbol}&apos;s filings…</p>
      <ol className="space-y-2 text-[13.5px] text-ink-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" style={{ animationDelay: `${i * 250}ms` }} />
            {s}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-[16px] bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
