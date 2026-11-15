import { getPromises } from "@/lib/pull/promises-source";
import type { CasePoint, GuidanceItem, PromisesResult, Verdict } from "@/lib/pull/promises";

const VERDICT: Record<Verdict["verdict"], { label: string; cls: string }> = {
  met: { label: "Met", cls: "bg-up-soft text-up" },
  on_track: { label: "On track", cls: "bg-up-soft text-up" },
  partly: { label: "Partly", cls: "bg-warn-soft text-warn" },
  off_track: { label: "Off track", cls: "bg-down-soft text-down" },
  missed: { label: "Missed", cls: "bg-down-soft text-down" },
  too_early: { label: "Too early", cls: "bg-surface-2 text-muted ring-1 ring-hairline" },
  unclear: { label: "Can't check", cls: "bg-surface-2 text-muted ring-1 ring-hairline" },
};
const JUDGED: Verdict["verdict"][] = ["missed", "off_track", "partly", "on_track", "met"];

function month(m: string | null | undefined): string {
  if (!m) return "earlier";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function Sources({ ids, r }: { ids: string[]; r: PromisesResult }) {
  const g = new Map(r.guidance.map((x) => [x.id, x]));
  const a = new Map(r.actuals.map((x) => [x.id, x]));
  const t = new Map(r.transcripts.map((x) => [x.id, x]));
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const gi = g.get(id);
        if (gi) {
          const tr = t.get(gi.transcript);
          return (
            <a
              key={id}
              href={tr ? `${tr.url}#page=${gi.page}` : undefined}
              target="_blank"
              rel="noreferrer"
              title={`“${gi.quote}”`}
              className="rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] text-muted ring-1 ring-hairline"
            >
              {month(tr?.month)} call · p.{gi.page} ↗
            </a>
          );
        }
        const ai = a.get(id);
        return ai ? (
          <span key={id} title={ai.text} className="rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] text-muted ring-1 ring-hairline">
            {ai.text.split(":")[0]}
          </span>
        ) : null;
      })}
    </span>
  );
}

function Quote({ item, r }: { item: GuidanceItem; r: PromisesResult }) {
  const tr = r.transcripts.find((t) => t.id === item.transcript);
  return (
    <blockquote className="mt-1.5 border-l-2 border-hairline pl-2.5 text-[12.5px] italic leading-snug text-ink-2">
      “{item.quote}”
      <a href={tr ? `${tr.url}#page=${item.page}` : undefined} target="_blank" rel="noreferrer" className="ml-1 not-italic text-muted">
        {month(tr?.month)} call, p.{item.page} ↗
      </a>
    </blockquote>
  );
}

function VerdictCard({ v, r }: { v: Verdict; r: PromisesResult }) {
  const g = r.guidance.find((x) => x.id === v.guidance_ids[0]);
  const style = VERDICT[v.verdict];
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold capitalize text-ink">{v.metric}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.cls}`}>{style.label}</span>
      </div>
      <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
        <span className="text-muted">Promised · </span>
        {v.promise}
      </p>
      <p className="mt-0.5 text-[13.5px] leading-snug text-ink">
        <span className="text-muted">Delivered · </span>
        {v.delivered}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer text-[11.5px] text-muted">Sources</summary>
        {g ? <Quote item={g} r={r} /> : null}
        <Sources ids={v.actual_ids} r={r} />
      </details>
    </li>
  );
}

function Case({ title, points, tone, r }: { title: string; points: CasePoint[]; tone: "up" | "down"; r: PromisesResult }) {
  if (!points.length) return null;
  return (
    <div className="rounded-[18px] border border-hairline bg-surface p-4">
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        <span className={`h-2 w-2 rounded-full ${tone === "up" ? "bg-up" : "bg-down"}`} aria-hidden />
        {title}
      </p>
      <ul className="mt-2 space-y-3">
        {points.map((p) => (
          <li key={p.point}>
            <p className="text-[14px] leading-snug text-ink">{p.point}</p>
            <Sources ids={p.ids} r={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Promised vs delivered + bull/bear (FR-14, FR-15, FR-16). Async: streamed under Suspense. */
export async function PromisesView({ symbol }: { symbol: string }) {
  const out = await getPromises(symbol);
  if (out.kind !== "ok") {
    return (
      <p className="mt-2 rounded-[18px] border border-dashed border-hairline px-4 py-3 text-[13px] leading-snug text-muted">
        {out.kind === "no-transcripts"
          ? `${symbol} doesn't publish earnings-call transcripts, so there are no spoken promises to check. The numbers above come from its filings.`
          : out.kind === "no-key"
            ? "Reading earnings calls needs the model API key, which isn't configured on this deployment."
            : `FINN couldn't read ${symbol}'s earnings calls just now (${out.message}). The numbers above are unaffected.`}
      </p>
    );
  }
  const r = out.result;
  const judged = r.verdicts.filter((v) => JUDGED.includes(v.verdict)).sort((a, b) => JUDGED.indexOf(a.verdict) - JUDGED.indexOf(b.verdict));
  const pending = r.verdicts.filter((v) => !JUDGED.includes(v.verdict));
  const pages = r.transcripts.reduce((a, t) => a + t.pages, 0);
  const models = [...new Set(r.usage.map((u) => u.model))].join(" + ");
  const tokens = r.usage.reduce((a, u) => a + u.input + u.output, 0);

  if (!r.guidance.length) {
    return <p className="mt-2 px-1 text-[13px] text-muted">The last earnings calls contain no measurable guidance to check.</p>;
  }

  return (
    <>
      {r.scorecard ? <p className="mt-2 px-1 font-serif text-[19px] leading-snug text-ink">{r.scorecard}</p> : null}

      {judged.length ? (
        <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
          {judged.map((v) => (
            <VerdictCard key={v.metric + v.promise} v={v} r={r} />
          ))}
        </ul>
      ) : null}

      {pending.length ? (
        <details className="mt-2 rounded-[18px] border border-hairline bg-surface-2">
          <summary className="cursor-pointer px-4 py-3 text-[13px] text-ink-2">
            {pending.length} more promise{pending.length > 1 ? "s" : ""} FINN can&apos;t check from the filings yet
          </summary>
          <ul className="divide-y divide-hairline border-t border-hairline">
            {pending.map((v) => (
              <VerdictCard key={v.metric + v.promise} v={v} r={r} />
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-6 space-y-3">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Bull vs bear</h2>
        <Case title="The bull case" points={r.bull} tone="up" r={r} />
        <Case title="The bear case" points={r.bear} tone="down" r={r} />
      </div>

      <p className="mt-3 px-1 text-[11.5px] leading-snug text-muted">
        Read {r.transcripts.length} earnings calls ({pages} pages, {r.transcripts.map((t) => month(t.month)).join(", ")}). {r.guidance.length}{" "}
        statements extracted, each quote checked against its page
        {r.dropped.quotes ? ` (${r.dropped.quotes} failed and were dropped)` : ""}. Compared with the filed numbers by {models}
        {r.dropped.claims ? `; ${r.dropped.claims} claims without a valid source removed` : "; every claim cites its source"}.{" "}
        {tokens ? `${Math.round(tokens / 1000)}k tokens, free tier.` : ""}
      </p>
    </>
  );
}

export function PromisesProgress() {
  return (
    <div className="mt-2 space-y-2 rounded-[18px] border border-hairline bg-surface p-4" role="status" aria-live="polite">
      <p className="text-[13.5px] text-ink-2">Reading the last four earnings calls…</p>
      <ol className="space-y-1.5 text-[12.5px] text-muted">
        {["Extracting what management promised, with quotes", "Checking every quote against its page", "Comparing promises with the filed numbers"].map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" style={{ animationDelay: `${i * 250}ms` }} />
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
