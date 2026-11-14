"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { ago, clock, countPhrase, longDate } from "@/lib/format";
import { useTriage } from "@/lib/triage";
import type { StoryCard as Story } from "@/lib/types";

import { ReactionPill } from "./reaction-pill";
import { StoryCard } from "./story-card";

const WINDOWS = [
  { key: "24h", label: "24h", hours: 24 },
  { key: "3d", label: "3 days", hours: 72 },
  { key: "7d", label: "7 days", hours: 168 },
  { key: "30d", label: "30 days", hours: 720 },
] as const;
type WindowKey = (typeof WINDOWS)[number]["key"];

/** One quiet line on a compact row: "Rohan Mehta can introduce you to Guha". */
function WayIn({ story }: { story: Story }) {
  const person = story.people.find((p) => p.change !== "leaves" && p.paths.length && p.paths[0].label !== "weak");
  if (!person) return null;
  const path = person.paths[0];
  const surname = person.name.split(" ").slice(-1)[0];
  return (
    <p className="mt-1 text-[12px] text-people">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-people align-middle" aria-hidden />
      {path.kind === "via" ? `${path.via_name} knows ${surname} (${path.label})` : `You know ${surname}`}
    </p>
  );
}

function isWeekend(iso: string): boolean {
  const day = new Date(iso).toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
  return day === "Sat" || day === "Sun";
}

export function Brief({ stories, now }: { stories: Story[]; now: string }) {
  const [win, setWin] = useState<WindowKey>("24h");
  const { triage, isHidden, mark: markStory, restore: restoreStories } = useTriage(now);
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [showRoutine, setShowRoutine] = useState(false);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 4000);
    return () => clearTimeout(t);
  }, [undo]);

  const hours = WINDOWS.find((w) => w.key === win)!.hours;
  const since = new Date(new Date(now).getTime() - hours * 3600 * 1000).toISOString();

  const { top, notable, routine, done } = useMemo(() => {
    const inWindow = stories.filter((s) => s.filedAt >= since);
    const byScore = (a: Story, b: Story) => b.score - a.score;
    return {
      top: inWindow.filter((s) => s.tier === "top" && !isHidden(s.id)).sort(byScore),
      notable: inWindow.filter((s) => s.tier === "notable" && !isHidden(s.id)).sort(byScore),
      routine: inWindow.filter((s) => s.tier === "routine"),
      done: inWindow.filter((s) => s.tier !== "routine" && isHidden(s.id)).map((s) => s.id),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isHidden is derived from triage
  }, [stories, since, triage]);

  function mark(id: string, state: "done" | "snoozed") {
    markStory(id, state);
    setUndo({ id, label: state === "done" ? "Marked done" : "Snoozed till next update" });
  }
  function restore(ids: string[]) {
    restoreStories(ids);
    setUndo(null);
  }

  const quiet = top.length === 0 && notable.length === 0;
  const routineCompanies = new Set(routine.map((r) => r.symbol)).size;

  return (
    <main className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="pt-2">
        <p className="text-[12.5px] text-muted">
          {longDate(now)} · as of {clock(now)} IST
        </p>
        <h1 className="mt-2 font-serif text-[34px] leading-[1.05] tracking-[-0.02em]">
          {countPhrase(top.length)} {top.length === 1 ? "matters" : "matter"}.
        </h1>
        <p className="mt-2 text-[14.5px] leading-snug text-ink-2">
          {notable.length ? `${notable.length} worth a glance. ` : ""}
          {routine.length ? `${routine.length} routine filing${routine.length === 1 ? "" : "s"} filed away.` : "No routine paperwork."}
        </p>
      </header>

      <div role="tablist" aria-label="Time window" className="mt-5 flex gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-hairline">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            role="tab"
            aria-selected={win === w.key}
            onClick={() => setWin(w.key)}
            className={`h-9 flex-1 rounded-full text-[13px] font-medium transition-colors ${
              win === w.key ? "bg-ink text-paper" : "text-muted"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {quiet && win === "24h" ? (
        <div className="mt-5 rounded-[16px] border border-dashed border-hairline px-4 py-3 text-[13.5px] leading-snug text-ink-2">
          {isWeekend(now) ? "A quiet 24 hours: exchanges are shut for the weekend." : "Nothing material in the last 24 hours."}{" "}
          <button className="font-medium text-ink underline underline-offset-2" onClick={() => setWin("3d")}>
            See the last 3 days
          </button>
        </div>
      ) : null}

      <section aria-label="Matters" className="mt-5 space-y-3">
        <AnimatePresence initial={false}>
          {top.map((s, i) => (
            <StoryCard
              key={s.id}
              story={s}
              now={now}
              showContact={top.findIndex((t) => t.symbol === s.symbol) === i}
              onDone={(id) => mark(id, "done")}
              onSnooze={(id) => mark(id, "snoozed")}
            />
          ))}
        </AnimatePresence>
        {top.length > 0 ? (
          <p className="px-1 text-center text-[11.5px] text-muted">Swipe left when done · right to snooze</p>
        ) : null}
      </section>

      {notable.length ? (
        <section aria-label="Worth a glance" className="mt-8">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Worth a glance</h2>
          <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
            {notable.map((s) => (
              <li key={s.id}>
                <Link href={`/c/${encodeURIComponent(s.symbol)}`} className="block px-4 py-3 active:bg-surface-2">
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <span className="font-mono font-semibold text-ink">{s.symbol}</span>
                    <span>{s.categoryLabel}</span>
                    <span aria-hidden>·</span>
                    <span>{ago(s.filedAt, now)}</span>
                    <span className="ml-auto">
                      <ReactionPill reaction={s.reaction} />
                    </span>
                  </div>
                  <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink">{s.headline}</p>
                  {s.summary ? <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{s.summary}</p> : null}
                  <WayIn story={s} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {routine.length ? (
        <section aria-label="Routine" className="mt-8">
          <button
            onClick={() => setShowRoutine((v) => !v)}
            aria-expanded={showRoutine}
            className="flex w-full items-center justify-between rounded-[18px] border border-hairline bg-surface-2 px-4 py-3 text-left"
          >
            <span className="text-[13.5px] text-ink-2">
              <span className="font-medium text-ink">{routine.length} routine filings</span> across {routineCompanies}{" "}
              {routineCompanies === 1 ? "company" : "companies"}
            </span>
            <span className="text-muted">{showRoutine ? "Hide" : "Show"}</span>
          </button>
          <AnimatePresence initial={false}>
            {showRoutine ? (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 overflow-hidden px-1"
              >
                {routine.map((s) => (
                  <li key={s.id} className="flex gap-3 py-1.5 text-[12.5px] leading-snug">
                    <span className="w-[86px] shrink-0 font-mono text-muted">{s.symbol}</span>
                    <span className="text-ink-2">{s.headline}</span>
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </section>
      ) : null}

      {done.length ? (
        <p className="mt-6 text-center text-[12px] text-muted">
          {done.length} handled in this window ·{" "}
          <button className="underline underline-offset-2" onClick={() => restore(done)}>
            bring back
          </button>
        </p>
      ) : null}

      <AnimatePresence>
        {undo ? (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit items-center gap-4 rounded-full bg-ink px-4 py-2.5 text-[13px] text-paper shadow-card"
          >
            {undo.label}
            <button className="font-semibold" onClick={() => restore([undo.id])}>
              Undo
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
