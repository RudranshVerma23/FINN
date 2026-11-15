import Link from "next/link";

import { SearchBox } from "@/components/search-box";
import { getCompanies } from "@/lib/data";

export const metadata = { title: "Research · FINN" };

// Pull: research any NSE company from its own filings (FR-11).
export default function ResearchHome() {
  const companies = getCompanies();
  const watch = companies.filter((c) => !c.in_portfolio);
  const held = companies.filter((c) => c.in_portfolio);
  return (
    <main className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="pt-2 font-serif text-[30px] tracking-[-0.02em]">Research</h1>
      <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
        Any NSE company, read from its own annual reports, results and earnings calls. No news, no broker notes.
      </p>
      <div className="mt-4">
        <SearchBox />
      </div>

      <section className="mt-6">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Watchlist</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {watch.map((c) => (
            <Link key={c.symbol} href={`/r/${encodeURIComponent(c.symbol)}`} className="rounded-full border border-hairline bg-surface px-3 py-1.5 font-mono text-[12.5px]">
              {c.symbol}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-5">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Portfolio</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {held.map((c) => (
            <Link key={c.symbol} href={`/r/${encodeURIComponent(c.symbol)}`} className="rounded-full border border-hairline bg-surface px-3 py-1.5 font-mono text-[12.5px] text-ink-2">
              {c.symbol}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
