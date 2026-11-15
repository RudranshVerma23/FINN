"use client";

import Link from "next/link";
import { useState } from "react";

import type { Answer } from "@/lib/ask";

const EXAMPLES = ["Who knows semiconductors?", "Who should I call about Tata Power?", "What changed at PI Industries?"];

/** Ask FINN (FR-25): the model only routes the question; the answer comes from your own data. */
export function AskBar({ placeholder = "Ask FINN" }: { placeholder?: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(question: string) {
    if (question.trim().length < 3) return;
    setQ(question);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: question }) });
      if (!res.ok) throw new Error(String(res.status));
      setAns((await res.json()) as Answer);
    } catch {
      setErr("FINN couldn't answer that just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="flex gap-2"
      >
        <label htmlFor="ask" className="sr-only">
          Ask FINN
        </label>
        <input
          id="ask"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          className="h-12 min-w-0 flex-1 rounded-[14px] border border-hairline bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-muted focus:border-ink"
        />
        <button type="submit" disabled={busy} className="h-12 shrink-0 rounded-[14px] bg-ink px-4 text-[14px] font-medium text-paper disabled:opacity-60">
          {busy ? "…" : "Ask"}
        </button>
      </form>

      {!ans && !busy ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} onClick={() => run(x)} className="rounded-full bg-surface-2 px-3 py-1.5 text-[12px] text-ink-2 ring-1 ring-hairline">
              {x}
            </button>
          ))}
        </div>
      ) : null}

      {err ? <p className="mt-2 px-1 text-[12.5px] text-warn">{err}</p> : null}

      {ans ? (
        <div className="mt-3 rounded-[18px] border border-hairline bg-surface p-4" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-serif text-[18px] leading-tight text-ink">{ans.title}</p>
            <button onClick={() => setAns(null)} className="shrink-0 text-[12px] text-muted">
              Clear
            </button>
          </div>
          {ans.items.length ? (
            <ul className="mt-2 divide-y divide-hairline">
              {ans.items.map((it) => (
                <li key={it.title + (it.subtitle ?? "")} className="py-2">
                  {it.href ? (
                    <Link href={it.href} className="block">
                      <span className="block text-[14px] text-ink">{it.title}</span>
                      {it.subtitle ? <span className="block text-[12.5px] leading-snug text-ink-2">{it.subtitle}</span> : null}
                    </Link>
                  ) : (
                    <button onClick={() => run(it.title)} className="text-left text-[14px] text-ink underline underline-offset-2">
                      {it.title}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted">{ans.empty ?? "Nothing found."}</p>
          )}
          <p className="mt-2 text-[10.5px] text-muted">
            {ans.routedBy === "model" ? "Question routed by the model; answer from your own data." : "Answered from your own data."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
