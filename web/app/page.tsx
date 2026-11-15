import { Brief } from "@/components/brief";
import { computeAlerts } from "@/lib/alerts";
import { getAlertInputs, getMeta, getReconnect, getStories } from "@/lib/data";

// The Brief (FR-02, FR-04, FR-10): what changed across the portfolio, ranked, with routine paperwork filed away.
export default function Page() {
  const meta = getMeta();
  // Unusual moves in the last session, with the investor's default thresholds (FR-09).
  const a = getAlertInputs();
  const moves = computeAlerts(a.bars, a.filings, a.companies, a.defaults, `${meta.last_trading_day}T00:00:00+05:30`)
    .filter((x) => x.kind === "move")
    .map((x) => ({ symbol: x.symbol, movePct: x.movePct ?? 0, volumeX: x.volumeX ?? 0 }));
  return (
    <Brief
      stories={getStories()}
      now={meta.generated_at}
      lastSession={{ day: meta.last_trading_day, moves }}
      reconnect={getReconnect()}
    />
  );
}
