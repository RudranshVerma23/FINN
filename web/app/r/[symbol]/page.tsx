import Link from "next/link";
import { Suspense } from "react";

import { ResearchProgress, ResearchView } from "@/components/research-view";
import { knownSymbols } from "@/lib/pull/fundamentals";

// Known tickers are prerendered from the committed snapshot; any other NSE ticker renders on
// first request (streamed behind a progress fallback) and is then kept (FR-11, FR-17, NFR-02).
export function generateStaticParams() {
  return knownSymbols().map((symbol) => ({ symbol }));
}

export async function generateMetadata(props: PageProps<"/r/[symbol]">) {
  const { symbol } = await props.params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} research · FINN` };
}

async function Body({ params }: { params: PageProps<"/r/[symbol]">["params"] }) {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol).toUpperCase();
  return (
    <Suspense fallback={<ResearchProgress symbol={sym} />}>
      <ResearchView symbol={sym} />
    </Suspense>
  );
}

export default function ResearchPage(props: PageProps<"/r/[symbol]">) {
  return (
    <main className="px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))]">
      <Link href="/research" className="inline-block py-2 text-[13px] text-muted">
        ← Research
      </Link>
      <Suspense fallback={<ResearchProgress symbol="…" />}>
        <Body params={props.params} />
      </Suspense>
    </main>
  );
}
