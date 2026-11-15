"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = { name: string; symbol: string };

/** Type a company or ticker; Enter on a bare ticker goes straight to its research (FR-11). */
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const rows = res.ok ? ((await res.json()) as Hit[]) : [];
        if (id === seq.current) setHits(rows);
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(symbol: string) {
    router.push(`/r/${encodeURIComponent(symbol.toUpperCase())}`);
  }

  const shown = q.trim().length >= 2 ? hits : [];

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const term = q.trim();
          if (!term) return;
          go(shown[0]?.symbol ?? term.replace(/\s+/g, ""));
        }}
      >
        <label htmlFor="q" className="sr-only">
          Company or NSE ticker
        </label>
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company or NSE ticker, e.g. Astral"
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="search"
          className="h-12 w-full rounded-[14px] border border-hairline bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-muted focus:border-ink"
        />
      </form>
      {shown.length ? (
        <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[14px] border border-hairline bg-surface">
          {shown.map((h) => (
            <li key={h.symbol}>
              <button onClick={() => go(h.symbol)} className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-surface-2">
                <span className="text-[14px] text-ink">{h.name}</span>
                <span className="font-mono text-[12px] text-muted">{h.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : busy ? (
        <p className="mt-2 px-1 text-[12px] text-muted">Searching…</p>
      ) : null}
    </div>
  );
}
