"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = { id: string; name: string; role: string; org: string; tie: string; strength: number; lastSpoke: string | null; expertise: string[] };

const TIE_DOT: Record<string, string> = { strong: "bg-people", good: "bg-people/70", light: "bg-people/40", weak: "bg-hairline" };

/** The expertise map as filters over the network (FR-24). */
export function PeopleDirectory({ rows, themes }: { rows: Row[]; themes: { theme: string; count: number }[] }) {
  const [theme, setTheme] = useState<string | null>(null);
  const shown = useMemo(() => (theme ? rows.filter((r) => r.expertise.includes(theme)) : rows), [rows, theme]);
  return (
    <>
      <section aria-label="Expertise map" className="mt-5">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">What your network knows</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {themes.map((t) => {
            const on = theme === t.theme;
            return (
              <button
                key={t.theme}
                aria-pressed={on}
                onClick={() => setTheme(on ? null : t.theme)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] ring-1 ${on ? "bg-people text-paper ring-people" : "bg-surface text-ink-2 ring-hairline"}`}
              >
                {t.theme} <span className={on ? "opacity-80" : "text-muted"}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="People" className="mt-5">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          {theme ? `${shown.length} people on ${theme}` : `${rows.length} people, closest first`}
        </h2>
        <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/p/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TIE_DOT[r.tie] ?? "bg-hairline"}`} aria-label={`${r.tie} tie`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-ink">{r.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {r.role}
                    {r.org ? `, ${r.org}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted">{r.lastSpoke ?? "no log"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
