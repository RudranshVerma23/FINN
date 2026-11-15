import Link from "next/link";
import { notFound } from "next/navigation";

import { relationText } from "@/lib/format";
import { appearances, getPeople, getPerson } from "@/lib/people";

export function generateStaticParams() {
  return getPeople().map((c) => ({ id: c.id }));
}

export async function generateMetadata(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  return { title: `${getPerson(id)?.name ?? "Person"} · FINN` };
}

function month(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// A person in the investor's network: who they are, how well you know them, and every place
// FINN would point you to them (FR-24).
export default async function PersonPage(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  const c = getPerson(id);
  if (!c) notFound();
  const where = appearances(id);
  const anything = where.calls.length || where.paths.length || where.events.length || where.reconnect;

  return (
    <main className="px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))]">
      <Link href="/people" className="inline-block py-2 text-[13px] text-muted">
        ← People
      </Link>
      <header className="mt-1">
        <h1 className="font-serif text-[30px] leading-[1.1] tracking-[-0.02em]">{c.name}</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">
          {c.current ? `${c.current.role}${c.current.org !== "Independent" ? `, ${c.current.org}` : ""}` : c.headline}
          {c.location ? ` · ${c.location}` : ""}
        </p>
        <p className="mt-2 inline-block rounded-full bg-people-soft px-3 py-1 text-[12px] text-ink">
          <span className="font-semibold capitalize">{c.tie.label}</span> tie · {c.tie.reasons.join(" · ")}
        </p>
      </header>

      {anything ? (
        <section className="mt-6">
          <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-people">Where {c.name.split(" ")[0]} can help</h2>
          <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface text-[13.5px] leading-snug">
            {where.reconnect ? (
              <li className="px-4 py-3">
                <span className="text-muted">Reason to reconnect · </span>
                {where.reconnect.company.replace(/\s+(Limited|Ltd\.?)$/i, "")}: {where.reconnect.headline}
              </li>
            ) : null}
            {where.paths.map((p) => (
              <li key={p.symbol + p.target} className="px-4 py-3">
                <Link href={`/c/${encodeURIComponent(p.symbol)}`}>
                  <span className="text-muted">Your way in to · </span>
                  <span className="font-medium">{p.target}</span> ({p.symbol}, {p.role}). {p.reason.charAt(0).toUpperCase() + p.reason.slice(1)}.
                </Link>
              </li>
            ))}
            {where.events.map((e) => (
              <li key={e.symbol + e.headline} className="px-4 py-3">
                <Link href={`/c/${encodeURIComponent(e.symbol)}`}>
                  <span className="text-muted">Best placed to explain · </span>
                  {e.symbol}: {e.headline}
                </Link>
              </li>
            ))}
            {where.calls.map((w) => (
              <li key={w.symbol} className="px-4 py-3">
                <Link href={`/r/${encodeURIComponent(w.symbol)}`}>
                  <span className="text-muted">Who to call about {w.symbol} · </span>
                  {relationText(w.relation, w.org)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Career</h2>
        <ol className="mt-2 space-y-0 rounded-[18px] border border-hairline bg-surface px-4 py-2">
          {[...c.career].reverse().map((s, i) => (
            <li key={i} className="flex gap-3 py-2">
              <span className="tabular w-[84px] shrink-0 font-mono text-[11.5px] text-muted">{s.span}</span>
              <span className="text-[13.5px] leading-snug">
                <span className="text-ink">{s.role}</span>
                <span className="text-ink-2">, {s.org}</span>
              </span>
            </li>
          ))}
        </ol>
        {c.education.length ? <p className="mt-2 px-1 text-[12.5px] text-muted">{c.education.map((e) => `${e.degree}, ${e.org}`).join(" · ")}</p> : null}
        {c.expertise.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5 px-1">
            {c.expertise.map((e) => (
              <span key={e} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-2 ring-1 ring-hairline">
                {e}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Your conversations</h2>
        {c.interactions?.length ? (
          <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-surface text-[13px]">
            {c.interactions.map((i) => (
              <li key={i.on + i.kind} className="flex gap-3 px-4 py-2.5">
                <span className="w-[92px] shrink-0 text-muted">{month(i.on)}</span>
                <span className="text-ink-2">
                  <span className="capitalize text-ink">{i.kind}</span>
                  {i.note ? ` · ${i.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 px-1 text-[13px] text-muted">None logged.</p>
        )}
      </section>
    </main>
  );
}
