"use client";

import { useState } from "react";

import type { Results } from "@/lib/types";

function crore(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  const s = abs >= 1000 ? Math.round(abs).toLocaleString("en-IN") : abs.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return `${v < 0 ? "−" : ""}₹${s}`;
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted">—</span>;
  if (Math.abs(pct) < 0.05) return <span className="text-muted">flat</span>;
  const tone = pct > 0.5 ? "text-up" : pct < -0.5 ? "text-down" : "text-muted";
  return (
    <span className={tone}>
      {pct > 0 ? "+" : pct < 0 ? "−" : ""}
      {Math.abs(pct) >= 100 ? Math.abs(pct).toFixed(0) : Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function bps(a: number | null, b: number | null): string | null {
  if (a === null || b === null) return null;
  const d = Math.round((a - b) * 100);
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)} bps`;
}

/** Revenue, EBITDA, PBT, PAT with QoQ and YoY, from the exchange XBRL (FR-07, NFR-06). */
export function ResultsTable({ results }: { results: Results }) {
  const [open, setOpen] = useState(false);
  const failed = results.checks.filter((c) => !c.ok);
  const passed = results.checks.length - failed.length;
  const m = results.margin;

  return (
    <div className="mt-3 rounded-[14px] border border-hairline bg-surface-2 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {results.quarter} · {results.basis}
        </p>
        <p className="text-[11px] text-muted">₹ crore</p>
      </div>

      <table className="tabular mt-1.5 w-full font-mono text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-muted">
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">Quarter</th>
            <th className="py-1 text-right font-medium">QoQ</th>
            <th className="py-1 text-right font-medium">YoY</th>
          </tr>
        </thead>
        <tbody>
          {results.lines.map((l) => (
            <tr key={l.key} className="border-t border-hairline">
              <td className="py-1.5 font-sans text-[12.5px] text-ink-2">{l.label}</td>
              {l.value === null ? (
                <td colSpan={3} className="py-1.5 text-right font-sans text-[11.5px] text-muted">
                  not meaningful
                </td>
              ) : (
                <>
                  <td className="py-1.5 text-right text-ink">{crore(l.value)}</td>
                  <td className="py-1.5 text-right">
                    <Delta pct={l.qoq_pct} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Delta pct={l.yoy_pct} />
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {m && m.value !== null ? (
        <p className="mt-2 text-[12px] text-ink-2">
          {m.label} <span className="tabular font-mono text-ink">{m.value.toFixed(1)}%</span>
          {bps(m.value, m.prev) ? <span className="text-muted"> · {bps(m.value, m.prev)} QoQ</span> : null}
          {bps(m.value, m.year_ago) ? <span className="text-muted"> · {bps(m.value, m.year_ago)} YoY</span> : null}
        </p>
      ) : null}

      {results.jv_note ? <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">{results.jv_note}</p> : null}
      {failed.map((c) => (
        <p key={c.name} className="mt-1.5 text-[11.5px] leading-snug text-warn">
          {c.name.replace(" vs Screener", "")} differs from Screener ({c.detail}). Definitions may differ; check the filing.
        </p>
      ))}

      <div className="mt-2 flex items-center gap-3 text-[11.5px] text-muted">
        <button className="underline underline-offset-2" onClick={() => setOpen((o) => !o)}>
          {passed}/{results.checks.length} checks passed
        </button>
        {results.source_url ? (
          <a href={results.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Exchange XBRL ↗
          </a>
        ) : null}
      </div>
      {open ? (
        <ul className="mt-1.5 space-y-0.5 text-[11.5px] leading-snug text-ink-2">
          {results.checks.map((c) => (
            <li key={c.name}>
              <span className={c.ok ? "text-up" : "text-warn"}>{c.ok ? "✓" : "!"}</span> {c.name}: {c.detail}
            </li>
          ))}
          <li className="text-muted">{results.note}</li>
        </ul>
      ) : null}
    </div>
  );
}
