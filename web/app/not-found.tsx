import Link from "next/link";

export default function NotFound() {
  return (
    <main className="px-4 pt-16">
      <p className="font-mono text-[13px] text-muted">404</p>
      <h1 className="mt-1 font-serif text-[30px] leading-tight tracking-[-0.02em]">Nothing here.</h1>
      <p className="mt-2 text-[14.5px] leading-snug text-ink-2">
        That page doesn&apos;t exist. If you were looking for a company, research any NSE ticker instead.
      </p>
      <div className="mt-5 flex gap-2">
        <Link href="/" className="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-paper">
          Back to the Brief
        </Link>
        <Link href="/research" className="rounded-full px-4 py-2 text-[13.5px] text-ink ring-1 ring-hairline">
          Research
        </Link>
      </div>
    </main>
  );
}
