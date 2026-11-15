import type { Reaction } from "@/lib/types";
import { pct } from "@/lib/format";

/** "▼ 19.1% · 30× vol": only shown when the session after the filing was unusual. */
export function ReactionPill({ reaction }: { reaction: Reaction | null }) {
  if (!reaction) return null;
  const big = Math.abs(reaction.move_pct) >= 3 || (reaction.volume_x ?? 0) >= 2;
  if (!big) return null;
  const up = reaction.move_pct >= 0;
  return (
    <span
      className={`tabular inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] font-mono text-[11px] font-medium ${
        up ? "bg-up-soft text-up" : "bg-down-soft text-down"
      }`}
      title={`Session of ${reaction.date}`}
    >
      {up ? "▲" : "▼"} {pct(reaction.move_pct).replace(/^[+−]/, "")}
      {reaction.volume_x && reaction.volume_x >= 1.5 ? <span className="opacity-70">· {reaction.volume_x.toFixed(0)}× vol</span> : null}
    </span>
  );
}
