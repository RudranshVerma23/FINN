"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { computeAlerts, type Alert, type AlertCompany, type AlertSettings, type SlimBar, type SlimFiling } from "@/lib/alerts";
import { ago, shortDate } from "@/lib/format";
import { useLocalSettings } from "@/lib/local-settings";

const WINDOWS = [
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
] as const;

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="tabular font-mono text-ink">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--ink)]"
      />
    </label>
  );
}

function AlertRow({ a, company, now }: { a: Alert; company?: AlertCompany; now: string }) {
  if (a.kind === "filing" && a.filing) {
    return (
      <Link href={`/c/${encodeURIComponent(a.symbol)}`} className="block px-4 py-3 active:bg-surface-2">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="font-mono font-semibold text-ink">{a.symbol}</span>
          <span className="text-accent">{a.filing.categoryLabel}</span>
          <span aria-hidden>·</span>
          <span>{ago(a.filing.filedAt, now)}</span>
        </div>
        <p className="mt-1 text-[14px] leading-snug text-ink">{a.filing.headline}</p>
        <p className="mt-0.5 text-[11.5px] text-muted">On your list of filing types: {a.filing.categoryLabel}</p>
      </Link>
    );
  }
  const up = (a.movePct ?? 0) >= 0;
  const move = Math.abs(a.movePct ?? 0).toFixed(1);
  const vol = (a.volumeX ?? 0).toFixed(a.volumeX && a.volumeX < 10 ? 1 : 0);
  return (
    <Link href={`/c/${encodeURIComponent(a.symbol)}`} className="block px-4 py-3 active:bg-surface-2">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span className="font-mono font-semibold text-ink">{a.symbol}</span>
        <span className="truncate">{company?.name}</span>
        <span className="ml-auto flex shrink-0 gap-1">
          {a.triggers.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10.5px] ring-1 ring-hairline">
              {t === "volume" ? "volume" : "price"}
            </span>
          ))}
        </span>
      </div>
      <p className="mt-1 text-[14.5px] leading-snug text-ink">
        <span className={up ? "text-up" : "text-down"}>
          {up ? "Rose" : "Fell"} {move}%
        </span>{" "}
        on {vol}× its usual volume
      </p>
      {a.cause ? (
        <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
          <span className="text-muted">Likely cause · </span>
          {a.cause.categoryLabel}: {a.cause.headline}
        </p>
      ) : a.followsFrom ? (
        <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
          <span className="text-muted">Follow-through · </span>
          after {shortDate(a.followsFrom.day)}&apos;s {a.followsFrom.movePct >= 0 ? "+" : "−"}
          {Math.abs(a.followsFrom.movePct).toFixed(1)}%
          {a.followsFrom.cause ? ` (${a.followsFrom.cause.categoryLabel.toLowerCase()}: ${a.followsFrom.cause.headline})` : ""}
        </p>
      ) : (
        <p className="mt-1 text-[12px] leading-snug text-muted">No filing before this session explains it: worth a look.</p>
      )}
    </Link>
  );
}

export function AlertsInbox({
  bars,
  filings,
  companies,
  defaults,
  categoryOptions,
  now,
}: {
  bars: Record<string, SlimBar[]>;
  filings: SlimFiling[];
  companies: Record<string, AlertCompany>;
  defaults: AlertSettings;
  categoryOptions: { key: string; label: string }[];
  now: string;
}) {
  const [settings, set, reset] = useLocalSettings<AlertSettings>("finn.alerts.v1", defaults);
  const [days, setDays] = useState<7 | 30>(7);
  const [editing, setEditing] = useState(false);

  const since = new Date(new Date(now).getTime() - days * 86400000).toISOString();
  const alerts = useMemo(() => computeAlerts(bars, filings, companies, settings, since), [bars, filings, companies, settings, since]);

  const groups = useMemo(() => {
    const m = new Map<string, Alert[]>();
    for (const a of alerts) {
      const day = a.at.slice(0, 10);
      m.set(day, [...(m.get(day) ?? []), a]);
    }
    return [...m.entries()];
  }, [alerts]);

  const moves = alerts.filter((a) => a.kind === "move").length;

  return (
    <main className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="pt-2 font-serif text-[30px] tracking-[-0.02em]">Alerts</h1>
      <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
        You decide what &ldquo;unusual&rdquo; means. FINN watches every end-of-day close and every filing for it.
      </p>

      <section className="mt-4 rounded-[18px] border border-hairline bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] leading-snug text-ink-2">
            Volume <span className="font-medium text-ink">≥ {settings.volumeMultiple}×</span> its {settings.lookback}-day average, or a move of{" "}
            <span className="font-medium text-ink">≥ {settings.priceMovePct}%</span>; plus {settings.categories.length} filing type
            {settings.categories.length === 1 ? "" : "s"}
            {settings.includeWatchlist ? ", portfolio and watchlist" : ", portfolio only"}.
          </p>
          <button onClick={() => setEditing((e) => !e)} className="shrink-0 text-[13px] font-medium text-ink underline underline-offset-2">
            {editing ? "Done" : "Edit"}
          </button>
        </div>

        {editing ? (
          <div className="mt-4 space-y-4 border-t border-hairline pt-4">
            <Slider
              label="Volume spike"
              value={settings.volumeMultiple}
              min={1.5}
              max={6}
              step={0.5}
              format={(v) => `${v}× average`}
              onChange={(v) => set({ volumeMultiple: v })}
            />
            <div>
              <p className="text-[13px] text-ink-2">Average over</p>
              <div className="mt-1.5 flex gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-hairline">
                {[10, 20, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => set({ lookback: n })}
                    aria-pressed={settings.lookback === n}
                    className={`h-8 flex-1 rounded-full text-[12.5px] ${settings.lookback === n ? "bg-ink text-paper" : "text-muted"}`}
                  >
                    {n} days
                  </button>
                ))}
              </div>
            </div>
            <Slider
              label="Price move in a day"
              value={settings.priceMovePct}
              min={2}
              max={12}
              step={0.5}
              format={(v) => `±${v}%`}
              onChange={(v) => set({ priceMovePct: v })}
            />
            <div>
              <p className="text-[13px] text-ink-2">Alert me on these filings</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {categoryOptions.map((c) => {
                  const on = settings.categories.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      aria-pressed={on}
                      onClick={() =>
                        set({ categories: on ? settings.categories.filter((k) => k !== c.key) : [...settings.categories, c.key] })
                      }
                      className={`rounded-full px-3 py-1.5 text-[12.5px] ring-1 ${on ? "bg-ink text-paper ring-ink" : "bg-surface text-ink-2 ring-hairline"}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center justify-between text-[13px] text-ink-2">
              Include watchlist companies
              <input
                type="checkbox"
                checked={settings.includeWatchlist}
                onChange={(e) => set({ includeWatchlist: e.target.checked })}
                className="h-5 w-5 accent-[var(--ink)]"
              />
            </label>
            <button onClick={reset} className="text-[12.5px] text-muted underline underline-offset-2">
              Reset to defaults
            </button>
          </div>
        ) : null}
      </section>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[13px] text-ink-2" aria-live="polite">
          <span className="font-semibold text-ink">{alerts.length}</span> alert{alerts.length === 1 ? "" : "s"} · {moves} unusual session
          {moves === 1 ? "" : "s"}
        </p>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-hairline">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setDays(w.key)}
              aria-pressed={days === w.key}
              className={`h-7 rounded-full px-3 text-[12px] ${days === w.key ? "bg-ink text-paper" : "text-muted"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length ? (
        groups.map(([day, items]) => (
          <section key={day} className="mt-4">
            <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{shortDate(day)}</h2>
            <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
              {items.map((a) => (
                <li key={a.id}>
                  <AlertRow a={a} company={companies[a.symbol]} now={now} />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="mt-6 rounded-[18px] border border-dashed border-hairline px-4 py-3 text-[13.5px] leading-snug text-ink-2">
          Nothing crossed your thresholds in the last {days} days. Loosen them above to see more.
        </p>
      )}
      <p className="mt-6 px-1 pb-4 text-[11.5px] leading-snug text-muted">
        Evaluated on end-of-day closes and volumes (Yahoo Finance) and NSE filings. In production this runs after every
        close and sends a push notification; here it runs on the latest snapshot.
      </p>
    </main>
  );
}
