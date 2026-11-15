"use client";

import Link from "next/link";
import { useState } from "react";

import { shortName } from "@/lib/names";
import type { Reconnect } from "@/lib/types";

function lastSpoke(r: Reconnect): string {
  if (!r.last_spoke) return "no conversation logged";
  const d = new Date(r.last_spoke);
  return `last spoke ${d.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
}

function where(r: Reconnect): string {
  if (r.relation === "current") return `Works at ${r.org}`;
  if (r.relation === "competitor") return `At competitor ${r.org}`;
  return `Was at ${r.org} (${r.span})`;
}

/** Keep the network warm: dormant contacts whose employer just had news (FR-23). */
export function ReconnectList({ items }: { items: Reconnect[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section aria-label="Reasons to reconnect" className="mt-8">
      <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-people">Reasons to reconnect</h2>
      <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
        {shown.map((r) => (
          <li key={r.person_id}>
            <Link href={`/c/${encodeURIComponent(r.symbol)}`} className="block px-4 py-3 active:bg-surface-2">
              <p className="text-[14px] leading-snug text-ink">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-people align-middle" aria-hidden />
                <span className="font-semibold">{r.name}</span>
                <span className="text-muted"> · {lastSpoke(r)}</span>
              </p>
              <p className="mt-0.5 pl-3.5 text-[12.5px] leading-snug text-ink-2">
                {where(r)}. {shortName(r.company)} just had news: {r.headline}
              </p>
              {r.relation === "current" ? (
                <p className="mt-0.5 pl-3.5 text-[11.5px] leading-snug text-warn">Works there now: catch up, don&apos;t ask for unpublished numbers.</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 3 ? (
        <button onClick={() => setAll((a) => !a)} className="mt-2 px-1 text-[12px] text-muted underline underline-offset-2">
          {all ? "Show fewer" : `${items.length - 3} more`}
        </button>
      ) : null}
    </section>
  );
}
