"use client";

import Link from "next/link";
import { motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useState } from "react";

import { ago, relationText } from "@/lib/format";
import type { StoryCard as Story } from "@/lib/types";

import { ReactionPill } from "./reaction-pill";

const SWIPE = 110;

/** A story that matters: swipe left = done, swipe right = snooze, tap "Dig in" = research. */
export function StoryCard({
  story,
  now,
  showContact = true,
  onDone,
  onSnooze,
}: {
  story: Story;
  now: string;
  showContact?: boolean;
  onDone: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);
  const doneOpacity = useTransform(x, [-SWIPE, -30], [1, 0]);
  const snoozeOpacity = useTransform(x, [30, SWIPE], [0, 1]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE) onDone(story.id);
    else if (info.offset.x > SWIPE) onSnooze(story.id);
  }

  return (
    <div className="relative">
      {/* What the swipe will do, revealed underneath the card */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-[20px] px-6 text-[13px] font-medium">
        <motion.span style={{ opacity: snoozeOpacity }} className="text-warn">
          Snooze till next update
        </motion.span>
        <motion.span style={{ opacity: doneOpacity }} className="text-up">
          Done
        </motion.span>
      </div>

      <motion.article
        layout
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        style={{ x }}
        onDragEnd={onDragEnd}
        exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.22 } }}
        className="relative touch-pan-y rounded-[20px] border border-hairline bg-surface p-4 shadow-card"
      >
        <header className="flex items-center gap-2 text-[12px] text-muted">
          <span className="font-mono text-[12px] font-semibold tracking-tight text-ink">{story.symbol}</span>
          <span className="truncate">{story.company}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{ago(story.filedAt, now)}</span>
          <span className="ml-auto">
            <ReactionPill reaction={story.reaction} />
          </span>
        </header>

        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{story.categoryLabel}</p>
        <h3 className="mt-1 font-serif text-[21px] leading-[1.22] tracking-[-0.01em] text-ink">{story.headline}</h3>
        {story.summary ? <p className="mt-2 text-[14.5px] leading-[1.45] text-ink-2">{story.summary}</p> : null}

        {story.contact && showContact ? (
          <div className="mt-3 rounded-[14px] bg-people-soft px-3 py-2.5">
            <p className="text-[13px] leading-snug text-ink">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-people align-middle" aria-hidden />
              <span className="font-semibold">{story.contact.name}</span>
              <span className="text-ink-2"> can help · {relationText(story.contact.relation, story.contact.org)}</span>
            </p>
            <p className="mt-0.5 pl-3.5 text-[12.5px] leading-snug text-ink-2">{story.contact.angle}</p>
            {story.contact.caution ? (
              <p className="mt-1 pl-3.5 text-[11.5px] leading-snug text-warn">{story.contact.caution}</p>
            ) : null}
          </div>
        ) : null}

        {open ? (
          <ul className="mt-3 space-y-1 border-t border-hairline pt-3 text-[12.5px] leading-snug text-ink-2">
            {story.why.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="text-muted">—</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="mt-3 flex items-center gap-4 text-[12.5px]">
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted underline-offset-2 hover:underline">
            {open ? "Hide why" : "Why this?"}
          </button>
          {story.url ? (
            <a href={story.url} target="_blank" rel="noreferrer" className="text-muted underline-offset-2 hover:underline">
              Filing ↗
            </a>
          ) : null}
          {story.relatedCount ? <span className="text-muted">+{story.relatedCount}</span> : null}
          {/* Buttons mirror the swipe gestures, so triage never depends on a gesture (accessibility). */}
          <span className="ml-auto flex items-center gap-3">
            <button type="button" onClick={() => onSnooze(story.id)} className="text-muted" aria-label="Snooze till next update">
              Later
            </button>
            <button type="button" onClick={() => onDone(story.id)} className="text-muted" aria-label="Mark done">
              Done
            </button>
            <Link href={`/c/${encodeURIComponent(story.symbol)}`} className="font-medium text-ink">
              Dig in →
            </Link>
          </span>
        </footer>
      </motion.article>
    </div>
  );
}
