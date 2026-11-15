"use client";

import Link from "next/link";

// Something broke while rendering: say so plainly and offer a way on, never a stack trace.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4 pt-16">
      <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em]">Something went wrong.</h1>
      <p className="mt-2 text-[14.5px] leading-snug text-ink-2">
        FINN couldn&apos;t load this view. Your Brief and saved research are unaffected.
      </p>
      <div className="mt-5 flex gap-2">
        <button onClick={reset} className="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-paper">
          Try again
        </button>
        <Link href="/" className="rounded-full px-4 py-2 text-[13.5px] text-ink ring-1 ring-hairline">
          Back to the Brief
        </Link>
      </div>
    </main>
  );
}
