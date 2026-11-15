// Triggered alerts (FR-09), evaluated on end-of-day data with thresholds the investor sets.
// Pure functions: the inbox recomputes instantly as thresholds change.
//
//   move     a session where volume >= N x its trailing average, or |price move| >= X%
//            (one alert per stock per session, carrying both numbers), linked to its likely
//            cause: a material filing made after the previous close and before this one
//   filing   a material filing in a category the investor subscribed to, unless it is already
//            shown as the cause of a move

export interface AlertSettings {
  volumeMultiple: number; // e.g. 2.0
  lookback: number; // trading days in the volume average
  priceMovePct: number; // e.g. 5
  categories: string[];
  includeWatchlist: boolean;
}

export interface SlimBar {
  d: string; // YYYY-MM-DD
  c: number;
  v: number;
}

export interface SlimFiling {
  id: string;
  symbol: string;
  filedAt: string;
  category: string;
  categoryLabel: string;
  headline: string;
  tier: "top" | "notable" | "routine";
}

export interface AlertCompany {
  symbol: string;
  name: string;
  inPortfolio: boolean;
  weight: number;
}

export interface Alert {
  id: string;
  kind: "move" | "filing";
  symbol: string;
  at: string; // ISO date or datetime, for sorting and grouping
  movePct?: number;
  volumeX?: number;
  triggers: ("volume" | "price")[];
  cause?: SlimFiling;
  /** The previous session was also unusual for this stock: this one is follow-through. */
  followsFrom?: { day: string; movePct: number; cause?: SlimFiling };
  filing?: SlimFiling;
}

const CLOSE = "T15:30:00+05:30";

// When several filings land before one session, which most likely moved the stock.
const CAUSE_PRIORITY = ["results", "M&A", "litigation", "fund_raise", "pledging", "management_change", "capex", "credit_rating"];
const causeRank = (f: SlimFiling) => {
  const i = CAUSE_PRIORITY.indexOf(f.category);
  return (i < 0 ? CAUSE_PRIORITY.length : i) * 2 + (f.tier === "top" ? 0 : 1);
};

export function computeAlerts(
  bars: Record<string, SlimBar[]>,
  filings: SlimFiling[],
  companies: Record<string, AlertCompany>,
  s: AlertSettings,
  since: string, // ISO date: only sessions / filings on or after this
): Alert[] {
  const watched = (sym: string) => companies[sym] && (companies[sym].inPortfolio || s.includeWatchlist);
  const material = filings.filter((f) => f.tier !== "routine" && watched(f.symbol));
  const out: Alert[] = [];
  const causes = new Set<string>();

  for (const [sym, series] of Object.entries(bars)) {
    if (!watched(sym)) continue;
    let prev: Alert | null = null; // the alert for the previous session, if any
    for (let i = Math.max(1, s.lookback); i < series.length; i++) {
      const bar = series[i];
      const window = series.slice(i - s.lookback, i);
      const avg = window.reduce((a, b) => a + b.v, 0) / window.length;
      const volumeX = avg > 0 ? bar.v / avg : 0;
      const movePct = (bar.c / series[i - 1].c - 1) * 100;
      const triggers: Alert["triggers"] = [];
      if (volumeX >= s.volumeMultiple) triggers.push("volume");
      if (Math.abs(movePct) >= s.priceMovePct) triggers.push("price");
      if (!triggers.length) {
        prev = null;
        continue;
      }

      // Likely cause: the most material filing between the previous close and this close.
      const from = `${series[i - 1].d}${CLOSE}`;
      const to = `${bar.d}${CLOSE}`;
      const candidates = material
        .filter((f) => f.symbol === sym && new Date(f.filedAt) > new Date(from) && new Date(f.filedAt) <= new Date(to))
        .sort((a, b) => causeRank(a) - causeRank(b));
      const cause = candidates[0];
      const alert: Alert = { id: `move-${sym}-${bar.d}`, kind: "move", symbol: sym, at: `${bar.d}${CLOSE}`, movePct, volumeX, triggers, cause };
      if (!cause && prev && prev.at.slice(0, 10) === series[i - 1].d) {
        const root = prev.followsFrom ?? { day: prev.at.slice(0, 10), movePct: prev.movePct ?? 0, cause: prev.cause };
        alert.followsFrom = root;
      }
      prev = alert;
      // Sessions before the window still matter as context for follow-through, but aren't listed.
      if (bar.d < since.slice(0, 10)) continue;
      if (cause) causes.add(cause.id);
      out.push(alert);
    }
  }

  for (const f of material) {
    if (!s.categories.includes(f.category) || causes.has(f.id) || f.filedAt < since) continue;
    out.push({ id: `filing-${f.id}`, kind: "filing", symbol: f.symbol, at: f.filedAt, triggers: [], filing: f });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
