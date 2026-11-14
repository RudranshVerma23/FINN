import { Brief } from "@/components/brief";
import { getMeta, getStories } from "@/lib/data";

// The Brief (FR-02, FR-04, FR-10): what changed across the portfolio, ranked, with routine paperwork filed away.
export default function Page() {
  const meta = getMeta();
  return <Brief stories={getStories()} now={meta.generated_at} />;
}
