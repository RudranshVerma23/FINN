// Shapes of the snapshot produced by ingest/ (see docs/architecture.md section 3).

export type Tier = "top" | "notable" | "routine";

export interface Factor {
  name: string;
  value: number;
  reason: string;
}

export interface Reaction {
  date: string;
  move_pct: number;
  volume_x: number | null;
}

export interface Filing {
  id: string;
  symbol: string;
  company: string;
  filed_at: string;
  exchange_category: string;
  text: string;
  attachment_url: string | null;
  category: string;
  category_label: string;
  subtype: string;
  seniority: string | null;
  title: string;
  headline?: string;
  summary?: string;
  materiality?: { level: "high" | "medium" | "low"; reason: string };
  score: number;
  tier: Tier;
  why: string[];
  factors: Factor[];
  reaction: Reaction | null;
  story_id: string;
  related: string[];
  people?: FilingPerson[];
  event_contacts?: EventContact[];
}

/** A dormant contact with a natural reason to call (FR-23). */
export interface Reconnect {
  person_id: string;
  name: string;
  last_spoke: string | null;
  days_since: number | null;
  relation: "current" | "former" | "competitor";
  org: string;
  span: string;
  symbol: string;
  company: string;
  story_id: string;
  headline: string;
  category_label: string;
  filed_at: string;
  tie_label: string;
  score: number;
}

/** The person best placed to explain a material event (FR-08), with reasons. */
export interface EventContact {
  person_id: string;
  name: string;
  relation: "current" | "former" | "competitor" | "supplier" | "customer" | null;
  org: string;
  role: string;
  score: number;
  tie_label: string;
  why: string[];
  caution: string | null;
}

export interface Path {
  kind: "direct" | "via";
  strength: number;
  label: "strong" | "good" | "light" | "weak";
  via_id: string | null;
  via_name: string | null;
  hop1: string[];
  hop2: string[];
  caution: string | null;
  match_confidence: number | null;
  hop1_label: Path["label"] | null;
  hop2_label: Path["label"] | null;
}

/** A person announced in a management-change filing, with the profile the filing discloses. */
export interface FilingPerson {
  name: string;
  role: string;
  change: "joins" | "leaves" | "redesignated" | "reappointed";
  effective: string | null;
  bio: string | null;
  stints: { org: string; role: string; from: string | null; to: string | null; dates_approximate: boolean; end_unknown?: boolean }[];
  education: { org: string; degree: string }[];
  paths: Path[];
  source_filing: string;
}

export interface Company {
  symbol: string;
  name: string;
  industry: string | null;
  sector: string;
  cap: string | null;
  in_portfolio: boolean;
  weight: number;
}

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Meta {
  generated_at: string;
  enriched_at?: string;
  filings_from: string;
  filings_to: string;
  last_trading_day: string;
  counts: { companies: number; filings: number; price_bars: number };
}

export interface Tie {
  strength: number;
  label: "strong" | "good" | "light" | "weak";
  reasons: string[];
  last_interaction: string | null;
  interactions_24m: number;
}

export interface Contact {
  id: string;
  name: string;
  headline: string;
  location: string;
  current: { org: string; role: string } | null;
  career: { org: string; org_id: string | null; role: string; span: string }[];
  education: { org: string; degree: string }[];
  expertise: string[];
  public_figure: boolean;
  tie: Tie;
}

export interface Suggestion {
  person_id: string;
  name: string;
  relation: "current" | "former" | "competitor" | "supplier" | "customer";
  org: string;
  role: string;
  span: string;
  score: number;
  tie_label: string;
  tie_reasons: string[];
  angle: string;
  caution: string | null;
}

export interface NetworkSnapshot {
  as_of: string;
  contacts: Contact[];
  who_to_call: Record<string, Suggestion[]>;
  expertise: Record<string, string[]>;
}

export interface ResultLine {
  key: "revenue" | "ebitda" | "pbt" | "pat";
  label: string;
  value: number | null; // ₹ crore
  prev: number | null;
  year_ago: number | null;
  qoq_pct: number | null;
  yoy_pct: number | null;
}

/** Headline numbers for the latest quarter, straight from the exchange XBRL (FR-07). */
export interface Results {
  symbol: string;
  quarter_end: string;
  quarter: string;
  basis: "consolidated" | "standalone";
  kind: "corporate" | "nbfc" | "bank";
  filed_at: string | null;
  source_url: string | null;
  lines: ResultLine[];
  margin: { label: string; value: number | null; prev: number | null; year_ago: number | null } | null;
  note: string;
  jv_note: string | null;
  checks: { name: string; ok: boolean; detail: string }[];
  headline: string | null;
  missing: string[];
}

/** What the Brief screen needs per story: small enough to ship to the client. */
export interface StoryCard {
  id: string;
  symbol: string;
  company: string;
  filedAt: string;
  tier: Tier;
  score: number;
  category: string;
  categoryLabel: string;
  headline: string;
  summary: string | null;
  why: string[];
  reaction: Reaction | null;
  relatedCount: number;
  url: string | null;
  inPortfolio: boolean;
  weight: number;
  contact: { name: string; relation: string; org: string; tie: string; angle: string; caution: string | null } | null;
  /** For M&A / capex / litigation / fund raises: who can explain THIS event, and why. */
  eventContacts: EventContact[];
  people: FilingPerson[];
  results: Results | null;
}
