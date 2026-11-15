import type { EventContact } from "@/lib/types";

/** "Kunal Verma is best placed to explain this", with the reasons, for a material event (FR-08). */
export function EventContactBlock({ contacts }: { contacts: EventContact[] }) {
  const [best, next] = contacts;
  if (!best) return null;
  return (
    <div className="mt-3 rounded-[14px] bg-people-soft px-3 py-2.5">
      <p className="text-[13px] leading-snug text-ink">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-people align-middle" aria-hidden />
        <span className="font-semibold">{best.name}</span>
        <span className="text-ink-2"> is best placed to explain this</span>
      </p>
      <ul className="mt-1 space-y-0.5 pl-3.5 text-[12.5px] leading-snug text-ink-2">
        {best.why.slice(0, 3).map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {best.caution ? <p className="mt-1 pl-3.5 text-[11.5px] leading-snug text-warn">{best.caution}</p> : null}
      {next ? (
        <p className="mt-1.5 pl-3.5 text-[12px] text-ink-2">
          <span className="text-muted">Also: </span>
          {next.name}, {next.why[0].charAt(0).toLowerCase() + next.why[0].slice(1)}
        </p>
      ) : null}
    </div>
  );
}
