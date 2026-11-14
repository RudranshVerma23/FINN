import Link from "next/link";
import { notFound } from "next/navigation";

import { PersonBlock } from "@/components/person-block";
import { ReactionPill } from "@/components/reaction-pill";
import { Sparkline } from "@/components/sparkline";
import { getCompanies, getCompany, getMeta, getPrices, getStories, getWhoToCall, lastMove, shortName } from "@/lib/data";
import { ago, pct, relationText, shortDate } from "@/lib/format";

export function generateStaticParams() {
  return getCompanies().map((c) => ({ symbol: c.symbol }));
}

export async function generateMetadata(props: PageProps<"/c/[symbol]">) {
  const { symbol } = await props.params;
  const c = getCompany(decodeURIComponent(symbol));
  return { title: c ? `${c.symbol} · FINN` : "FINN" };
}

// Company page: the "dig in" target from a Brief card (FR-10). Pull research lands here in v0.2.
export default async function CompanyPage(props: PageProps<"/c/[symbol]">) {
  const { symbol: raw } = await props.params;
  const symbol = decodeURIComponent(raw);
  const company = getCompany(symbol);
  if (!company) notFound();

  const meta = getMeta();
  const bars = getPrices(symbol).slice(-126);
  const move = lastMove(symbol);
  const stories = getStories(symbol);
  const material = stories.filter((s) => s.tier !== "routine");
  const routine = stories.length - material.length;
  const people = getWhoToCall(symbol);
  const first = bars[0]?.close;
  const last = bars[bars.length - 1]?.close;

  return (
    <main className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <Link href="/holdings" className="inline-block py-2 text-[13px] text-muted">
        ← Holdings
      </Link>

      <header className="mt-1">
        <p className="font-mono text-[13px] font-semibold">{company.symbol}</p>
        <h1 className="font-serif text-[30px] leading-[1.1] tracking-[-0.02em]">{shortName(company.name)}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {company.sector} · {company.in_portfolio ? `${company.weight}% of portfolio` : "Watchlist"}
        </p>
      </header>

      <section className="mt-5 rounded-[18px] border border-hairline bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <p className="tabular font-mono text-[22px]">{move ? `₹${move.close.toLocaleString("en-IN")}` : "—"}</p>
          {move ? (
            <p className={`tabular font-mono text-[13px] ${move.pct >= 0 ? "text-up" : "text-down"}`}>
              {pct(move.pct)} · {shortDate(meta.last_trading_day)}
            </p>
          ) : null}
        </div>
        <div className="mt-3">
          <Sparkline fluid bars={bars} width={343} height={72} marks={material.map((s) => s.reaction?.date).filter(Boolean) as string[]} />
        </div>
        {first && last ? (
          <p className="mt-2 text-[12px] text-muted">
            6 months: <span className={last >= first ? "text-up" : "text-down"}>{pct((last / first - 1) * 100)}</span> · dots
            mark sessions after material filings
          </p>
        ) : null}
      </section>

      {people.length ? (
        <section className="mt-6">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-people">Who you know</h2>
          <ul className="mt-2 space-y-2">
            {people.map((p) => (
              <li key={p.person_id} className="rounded-[16px] bg-people-soft px-4 py-3">
                <p className="text-[14px] text-ink">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-ink-2">
                    {" "}
                    · {relationText(p.relation, p.org)} ({p.span})
                  </span>
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{p.angle}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">
                  {p.tie_label} tie · {p.tie_reasons.join(" · ")}
                </p>
                {p.caution ? <p className="mt-1 text-[11.5px] leading-snug text-warn">{p.caution}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Last 30 days</h2>
        <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface">
          {material.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <span className={s.tier === "top" ? "font-semibold text-accent" : ""}>{s.categoryLabel}</span>
                <span aria-hidden>·</span>
                <span>{ago(s.filedAt, meta.generated_at)}</span>
                <span className="ml-auto">
                  <ReactionPill reaction={s.reaction} />
                </span>
              </div>
              <p className="mt-1 text-[14.5px] font-medium leading-snug">{s.headline}</p>
              {s.summary ? <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{s.summary}</p> : null}
              {s.people
                .filter((p) => p.change !== "leaves")
                .slice(0, 1)
                .map((p) => (
                  <PersonBlock key={p.name} person={p} />
                ))}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] text-muted underline underline-offset-2">
                  Filing ↗
                </a>
              ) : null}
            </li>
          ))}
          {material.length === 0 ? <li className="px-4 py-3 text-[13px] text-muted">No material filings in 30 days.</li> : null}
        </ul>
        {routine ? <p className="mt-2 px-1 text-[12px] text-muted">+ {routine} routine filings not shown</p> : null}
      </section>
    </main>
  );
}
