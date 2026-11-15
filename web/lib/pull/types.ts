// Shapes for the Pull side. `Fundamentals` mirrors ingest/finn/sources/screener.py exactly,
// so a committed snapshot and a live fetch are interchangeable.

export interface Table {
  periods: string[];
  rows: Record<string, (number | null)[]>;
}

export interface Fundamentals {
  symbol: string;
  name: string;
  bse_code: string | null;
  view: "consolidated" | "standalone";
  source_url: string;
  top_ratios: Record<string, string>;
  tables: {
    quarters: Table | null;
    profit_loss: Table | null;
    balance_sheet: Table | null;
    cash_flow: Table | null;
    ratios: Table | null;
  };
  documents: {
    annual_reports: { year: number | null; url: string }[];
    concalls: { month: string | null; transcript_url: string | null; presentation_url: string | null; recording_url: string | null }[];
  };
}

export type Tone = "up" | "down" | "neutral";

export interface Tile {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}

export interface Signal {
  kind: "growth" | "margin" | "cash" | "debt" | "working_capital" | "momentum" | "returns";
  text: string;
  tone: Tone;
  source: string; // which primary-derived table this came from
}

export interface Analysis {
  kind: "corporate" | "lender";
  revenueLabel: string;
  marginLabel: string;
  tiles: Tile[];
  trajectory: { years: string[]; revenue: (number | null)[]; profit: (number | null)[]; margin: (number | null)[] };
  cash: { years: string[]; cfo: (number | null)[]; profit: (number | null)[] } | null;
  signals: Signal[];
  marketCap: string | null;
  price: string | null;
}
