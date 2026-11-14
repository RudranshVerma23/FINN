"use client";

import { useState } from "react";

import type { FilingPerson, Path } from "@/lib/types";

/** "1989–95", "2003–?", "~1998–?", "Dec 2026–" */
function years(s: FilingPerson["stints"][number]): string {
  const y = (v: string | null) => (v ? v.slice(0, 4) : null);
  const from = y(s.from);
  const to = y(s.to);
  const approx = s.dates_approximate ? "~" : "";
  if (!from && !to) return s.end_unknown ? "earlier" : "now";
  if (from && !to) return `${approx}${from}–${s.end_unknown ? "?" : ""}`;
  if (!from && to) return `–${to}`;
  return from === to ? `${approx}${from}` : `${approx}${from}–${to!.slice(2)}`;
}

function shortOrg(org: string): string {
  return org
    .replace(/^The\s+/i, "")
    .replace(/\s+(Limited|Ltd\.?|Private Limited)$/i, "")
    .replace("National Thermal Power Corporation", "NTPC")
    .replace("Tata Power Delhi Distribution", "TPDDL")
    .replace("Tata Power Renewable Energy", "TPREL")
    .trim();
}

/** How to refer to someone in a sentence: first name, unless it's only an initial ("N. Venkatesan"). */
function callName(name: string): string {
  const first = name.split(" ")[0];
  return first.replace(".", "").length <= 2 ? name : first;
}

const STRENGTH_DOTS: Record<Path["label"], number> = { strong: 3, good: 2, light: 1, weak: 1 };

function Link({ label }: { label: Path["label"] }) {
  // A connector whose weight shows tie strength: thicker and darker for stronger ties.
  const n = STRENGTH_DOTS[label];
  return (
    <span className="flex min-w-[34px] flex-1 flex-col items-center gap-0.5" aria-label={`${label} tie`}>
      <span className="h-[2px] w-full rounded-full bg-people" style={{ opacity: 0.25 + n * 0.25, height: n + 0.5 }} />
      <span className="text-[10px] uppercase tracking-[0.06em] text-people">{label}</span>
    </span>
  );
}

function Node({ name, you = false, wide = false }: { name: string; you?: boolean; wide?: boolean }) {
  return (
    <span
      className={`min-w-0 truncate rounded-full px-2 py-1 text-[11.5px] font-medium ${wide ? "max-w-[42%] shrink-0" : "max-w-[28%]"} ${
        you ? "bg-ink text-paper" : "bg-surface text-ink ring-1 ring-people/40"
      }`}
    >
      {name}
    </span>
  );
}

function PathView({ path, target }: { path: Path; target: string }) {
  const first = (s: string) => s.split(" ")[0];
  return (
    <div>
      <div className="flex items-center gap-1">
        <Node name="You" you />
        {path.kind === "via" && path.via_name ? (
          <>
            <Link label={path.hop1_label ?? path.label} />
            <Node name={path.via_name} wide />
          </>
        ) : null}
        <Link label={(path.kind === "via" ? path.hop2_label : path.hop1_label) ?? path.label} />
        <Node name={target.split(" ").slice(-1)[0]} />
      </div>
      <ul className="mt-2 space-y-1 text-[12.5px] leading-snug text-ink-2">
        {path.kind === "via" ? (
          <>
            <li>
              <span className="text-muted">You ↔ {first(path.via_name!)}:</span> {path.hop1.slice(0, 2).join("; ")}
            </li>
            <li>
              <span className="text-muted">
                {first(path.via_name!)} ↔ {target.split(" ").slice(-1)}:
              </span>{" "}
              {path.hop2[0]}
            </li>
          </>
        ) : (
          <li>
            <span className="text-muted">You:</span> {path.hop1.filter((h) => !h.startsWith("name match")).slice(-1).join("; ")}
          </li>
        )}
      </ul>
      {path.caution ? <p className="mt-1.5 text-[11.5px] leading-snug text-warn">{path.caution}</p> : null}
    </div>
  );
}

/** The incoming person: who they are (from the filing), and who you know who knows them. */
export function PersonBlock({ person }: { person: FilingPerson }) {
  const [more, setMore] = useState(false);
  const career = person.stints.filter((s) => s.org);
  const [best, ...rest] = person.paths;
  const direct = person.paths.find((p) => p.kind === "direct" && (p.match_confidence ?? 1) >= 0.85);

  if (person.change === "leaves") {
    return (
      <p className="mt-3 text-[12.5px] text-muted">
        Leaving: <span className="text-ink-2">{person.name}</span>, {person.role}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-[14px] border border-hairline bg-surface-2 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Who is {person.name}</p>
      {person.bio ? <p className="mt-1 text-[13px] leading-snug text-ink-2">{person.bio}</p> : null}

      {career.length > 1 ? (
        <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11.5px] text-ink-2" aria-label="Career">
          {career.map((s, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 ? <span className="text-muted">→</span> : null}
              <span className="rounded-md bg-surface px-1.5 py-0.5 ring-1 ring-hairline">
                {shortOrg(s.org)} <span className="tabular text-muted">{years(s)}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {person.education.length ? (
        <p className="mt-1.5 text-[11.5px] text-muted">{person.education.map((e) => shortOrg(e.org)).join(" · ")}</p>
      ) : null}

      <div className="mt-3 border-t border-hairline pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-people">Your way in</p>
        {best ? (
          <div className="mt-2">
            <PathView path={best} target={person.name} />
            {direct && direct !== best ? (
              <p className="mt-2 text-[12px] text-ink-2">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-people align-middle" />
                You have met {callName(person.name)} yourself: {direct.hop1.filter((h) => h.startsWith("Last spoke")).join("")}
              </p>
            ) : null}
            {rest.filter((p) => p !== direct).length ? (
              <>
                <button className="mt-2 text-[12px] text-muted underline underline-offset-2" onClick={() => setMore((m) => !m)}>
                  {more ? "Hide other paths" : `${rest.filter((p) => p !== direct).length} more path${rest.length > 1 ? "s" : ""}`}
                </button>
                {more ? (
                  <div className="mt-2 space-y-3">
                    {rest
                      .filter((p) => p !== direct)
                      .map((p, i) => (
                        <PathView key={i} path={p} target={person.name} />
                      ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-[12.5px] leading-snug text-muted">
            No one in your network has crossed paths with {callName(person.name)}. FINN checked employers, schools and years.
          </p>
        )}
      </div>
    </div>
  );
}
