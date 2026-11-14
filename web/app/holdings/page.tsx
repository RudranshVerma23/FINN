import Link from "next/link";

import { Sparkline } from "@/components/sparkline";
import { getCompanies, getMeta, getPrices, getStories, lastMove, shortName } from "@/lib/data";
import { pct, shortDate } from "@/lib/format";

export const metadata = { title: "Holdings · FINN" };

export default function HoldingsPage() {
  const meta = getMeta();
  const companies = getCompanies();
  const stories = getStories();
  const groups = [
    { title: "Portfolio", items: companies.filter((c) => c.in_portfolio) },
    { title: "Watchlist", items: companies.filter((c) => !c.in_portfolio) },
  ];

  return (
    <main className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="pt-2 font-serif text-[30px] tracking-[-0.02em]">Holdings</h1>
      <p className="mt-1 text-[13px] text-muted">
        Close of {shortDate(meta.last_trading_day)} · 3-month trend · dots mark material filings
      </p>

      {groups.map((g) => (
        <section key={g.title} className="mt-6">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{g.title}</h2>
          <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
            {g.items.map((c) => {
              const bars = getPrices(c.symbol).slice(-63);
              const move = lastMove(c.symbol);
              const material = stories.filter((s) => s.symbol === c.symbol && s.tier !== "routine");
              const marks = material.map((s) => s.reaction?.date).filter(Boolean) as string[];
              return (
                <li key={c.symbol}>
                  <Link href={`/c/${encodeURIComponent(c.symbol)}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] font-semibold">{c.symbol}</span>
                        {c.in_portfolio ? <span className="tabular text-[11.5px] text-muted">{c.weight}%</span> : null}
                      </p>
                      <p className="truncate text-[12.5px] text-muted">
                        {shortName(c.name)} · {c.sector}
                      </p>
                    </div>
                    <Sparkline bars={bars} marks={marks} />
                    <div className="w-[64px] text-right">
                      <p className="tabular font-mono text-[13px]">{move ? move.close.toLocaleString("en-IN") : "—"}</p>
                      {move ? (
                        <p className={`tabular font-mono text-[11.5px] ${move.pct >= 0 ? "text-up" : "text-down"}`}>{pct(move.pct)}</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
