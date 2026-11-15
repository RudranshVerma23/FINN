# FINN — Architecture

Status: v1 (T00, will be refined as tasks land) · Requirements: [`requirements.md`](requirements.md) · Tasks: [`tasks.md`](tasks.md)

## 1. Shape of the system

FINN has two halves with very different rhythms:

- **Batch (Push + Network):** filings and prices change at most a few times a day. They are fetched, classified, scored and enriched **ahead of time**, and the results are written as a data snapshot. The app reads that snapshot — fast, cheap, and still working if a source goes down (NFR-01).
- **Interactive (Pull + Ask):** research on an arbitrary ticker can't be precomputed for every company, so it runs **on demand**, and every result is cached so the second request is instant (FR-17).

```mermaid
flowchart LR
  subgraph Sources["Public sources"]
    BSE["BSE / NSE<br/>announcements"]
    YF["Yahoo Finance<br/>EOD price + volume"]
    SCR["Screener.in<br/>financials + doc links"]
    PDF["Filing & transcript PDFs"]
  end

  subgraph Batch["Batch pipeline — Python (ingest/)"]
    FETCH["Fetch adapters"]
    CLS["Classify<br/>rules → bulk LLM"]
    SCORE["Score & treat"]
    EXT["Extract<br/>results numbers, exec bios"]
    NET["Network engine<br/>resolve · paths · tie strength"]
    ALERT["Alert rules<br/>(plain code)"]
  end

  SNAP[("Data snapshot<br/>data/snapshot/*.json")]
  NETDATA[("Private network data<br/>(synthetic)")]

  subgraph App["Web app — Next.js on Vercel (web/)"]
    UI["Mobile PWA<br/>Brief · Research · People"]
    API["API routes"]
    PULL["Pull pipeline<br/>extract → compare → cite"]
    CACHE[("Research cache")]
  end

  GEM["Gemini<br/>bulk + reasoning models"]

  BSE & YF & SCR & PDF --> FETCH --> CLS --> SCORE --> SNAP
  FETCH --> EXT --> SNAP
  NETDATA --> NET --> SNAP
  SNAP --> ALERT --> SNAP
  SNAP --> API --> UI
  UI --> API --> PULL
  PULL --> SCR & PDF
  PULL <--> CACHE
  CLS & EXT & PULL -. "documents only,<br/>never network PII" .-> GEM
```

## 2. Components

| Component | Where | Responsibility | Requirements |
|---|---|---|---|
| Fetch adapters | `ingest/finn/sources/` | `nse` (announcements + integrated-filing results index with XBRL links), `prices` (Yahoo EOD), `screener` (financial tables + annual report / transcript links). All go through one polite client: per-host rate limit, retries, identifying header, disk cache in `data/raw/`. | FR-01, FR-02, FR-11, NFR-10 |
| Classifier | `ingest/finn/classify.py` | Maps each filing to a reference category. Exchange-provided category plus keyword rules first; leftovers sent to the bulk model **in batches**. | FR-03, NFR-04 |
| Scorer | `ingest/finn/score.py` | `score = category weight × investor preference × position weight × network relevance × price reaction`. Stores each factor so the UI can explain the rank. | FR-04, FR-05, NFR-07 |
| Extractors | `ingest/finn/extract/` | Results numbers (structured data first, LLM fallback with checks); incoming-executive bio from appointment filings. | FR-06, FR-07, NFR-06 |
| Network engine | `ingest/finn/network/` | Entity resolution, 1st/2nd-degree paths, tie strength, who-to-call, reasons to reconnect. **Pure code, no LLM.** | FR-18–FR-23, NFR-05 |
| Alert rules | `ingest/finn/alerts.py` | Volume and price thresholds and category subscriptions evaluated on EOD data. | FR-09 |
| Data access layer | `web/lib/data/` | The only module that knows the snapshot is JSON files. Swapping to Postgres changes this module only. | NFR-09 |
| Pull pipeline | `web/lib/pull/` | Resolve ticker → fetch docs → bulk-extract guidance → compute actuals in code → reasoning model compares → citation validator. | FR-11–FR-17, NFR-02 |
| UI | `web/app/` | Brief (Push), Research (Pull), People (Network), alert settings. | FR-10, FR-24, FR-26, NFR-08 |

## 3. Data model (core entities)

```mermaid
erDiagram
  COMPANY ||--o{ FILING : files
  COMPANY ||--o{ PRICE_BAR : trades
  COMPANY ||--o{ FINANCIAL_PERIOD : reports
  FILING ||--o{ FILING_PERSON : mentions
  PERSON ||--o{ STINT : "worked at"
  PERSON ||--o{ EDUCATION : "studied at"
  PERSON ||--o{ TIE : "knows"
  FILING_PERSON }o--|| PERSON : "resolved to (confidence)"
  COMPANY ||--o{ COMPANY_LINK : "competitor / supplier / customer"
```

- **Filing:** id, company, timestamp, title, exchange category, FINN category, score + factors, summary, attachment URL.
- **Person / Stint / Education:** shared by network contacts and people found in filings, which makes matching a join rather than a special case.
- **Tie:** investor ↔ contact (and contact ↔ contact for second degree): strength 0–1, evidence list, last interaction date.

## 4. LLM usage and model routing

Principle: **use a model only where judgment over unstructured text is needed.** Arithmetic, matching and thresholds are code.

| Step | Model tier | Why this tier |
|---|---|---|
| Classifying filings the rules couldn't place | bulk | Short, high-volume, simple labels; batched ~30 per call. |
| One-line summaries of material filings | bulk | Short inputs, short outputs. |
| Results numbers (fallback only) | bulk | Structured extraction with a JSON schema; output checked in code. |
| Executive bio from an appointment filing | bulk | Extraction into a fixed schema. |
| Guidance statements from transcripts | bulk | Long input, structured output; run once per document and cached. |
| Promised vs delivered verdicts | reasoning | Needs to compare claims against numbers across quarters. |
| Bull vs bear | reasoning | Synthesis; run once per ticker, cached. |
| Network matching, paths, tie strength | **none** | Must be deterministic and explainable, and keeps personal data away from the model. |
| Financial snapshot, QoQ/YoY, ratios | **none** | Arithmetic. |
| Alerts | **none** | Thresholds. |

Model IDs live in one file, [`config/models.json`](../config/models.json), read by both the Python and TypeScript helpers. Each tier is a **fallback chain**: free-tier quotas apply per model, so when one model returns 429 the call moves to the next model in the chain.

Every call is cached by `sha256(model, system prompt, schema, input)`, so a repeated call costs nothing. Every call logs token usage to `data/llm_usage.jsonl`, which feeds the cost report.

**Agents.** The batch pipeline and the Pull pipeline are fixed pipelines: predictable, cacheable and cheap. The only component that plans and calls tools on its own is the Ask bar (FR-25), which gets read-only tools (`get_filings`, `get_financials`, `search_documents`, `network_lookup`).

## 5. Data security and privacy

| Concern | Prototype | Real deployment |
|---|---|---|
| Whose data is it | Synthetic network; no real person's data. | The investor uploads their own LinkedIn data export and meeting notes — data they own, given with consent. |
| What reaches an LLM | Public documents only (filings, transcripts). Network matching runs in code. | Same rule, plus a paid tier with zero data retention. |
| Isolation | Single demo investor. | Per-investor tenancy with database row-level security; network tables encrypted at rest. |
| Retention | Raw fetches cached locally, not committed. | Profile enrichments expire (e.g. 90 days) unless re-confirmed; contacts can be deleted on request. |
| Secrets | `.env` gitignored; Vercel environment variables. | A secrets manager, with keys rotated. |

## 6. Cloud: what runs where

| Piece | Prototype | Why |
|---|---|---|
| Web app + API routes | Vercel (Hobby) | One link that works on any phone; preview deploys per branch. |
| Batch pipeline | Run locally, output committed as the snapshot | Exchange sites often block cloud IPs; a snapshot keeps the demo reliable. |
| LLM | Gemini API (free tier) | ₹0 cost; long context for transcripts. |
| Next step | GitHub Actions cron → Postgres (Supabase) → same data access layer | Scheduled end-of-day refresh without a server to babysit. |

## 7. Key decisions (ADR log)

| # | Decision | Alternatives | Why |
|---|---|---|---|
| ADR-01 | Ranked, triage-card "brief" as the main surface; chat secondary | Chat-first, dashboard | The brief's core problem is filtering. A ranked brief makes filtering the interaction itself. |
| ADR-02 | Next.js PWA on Vercel | Expo, Flutter | A grader taps one link; no app store or Expo Go. |
| ADR-03 | Batch snapshot + on-demand Pull | Everything live | Reliability (NFR-01) and free-tier quota (NFR-04). |
| ADR-04 | Network logic in code, not an LLM | LLM reasoning over contacts | Deterministic, explainable, and keeps personal data private. |
| ADR-05 | Numbers from structured data, LLM only as a checked fallback | LLM reads every results PDF | Numbers must be right; models can make them up. |
| ADR-06 | Gemini free tier with per-model fallback chains | Anthropic (paid), Groq | ₹0 spend; fallback chains and caching work around low daily caps. |
| ADR-07 | Synthetic network + exec bios taken from filings | Scraping LinkedIn | Platform terms; appointment filings carry the bio, which is a primary source. |
| ADR-08 | NSE as the filings source; BSE dropped | BSE API primary | T01 spike: BSE's API returned 403 (Akamai) to scripted clients; NSE's API answered with full text plus attachment links. |
| ADR-09 | Results numbers from NSE "Integrated Filing – Financials" XBRL | NSE legacy results API, Screener tables, LLM on PDF | The legacy endpoint stops at Dec 2024 (SEBI moved results to integrated filings in 2025). The XBRL has Revenue, PBT, PAT, finance costs and D&A for the quarter (context `OneD`), so EBITDA is computed, not guessed. Values were checked against Screener for RELIANCE Q2 FY27. |
| ADR-10 | Raw `Close` from Yahoo, not `Adj Close` | Adjusted close | `Adj Close` was inconsistent for some NSE tickers in the spike; alerts only need day-over-day moves and volume ratios. |
| ADR-11 | Portfolio chosen by scanning ~78 names for real recent events (`scan_universe.py`) | Hand-picked blue chips | Puts genuine management changes, M&A, results and outsized moves (PIIND −19% on 17× volume, RELIANCE +11.6% on 4×) in the demo window, across 18 sectors. |
| ADR-12 | Snapshot builder keeps the previous data for any company whose fetch fails | Fail the whole run | A flaky exchange endpoint must never wipe good data (NFR-01). |
| ADR-13 | Network inputs mirror what an investor really has: a LinkedIn-style `connections.csv`, an interaction log, and their own background | A hand-made graph | Onboarding cost is one export plus a habit of logging meetings. Shared history (same batch, ex-colleagues) is *detected* from both careers, not typed in. |
| ADR-14 | One `Person` schema for contacts and for executives found in filings | Separate models | Matching a filing to the network becomes comparing two careers: same org, same unit, overlapping months, same school and years. |
| ADR-15 | Tie strength = small additive model with a sentence per point; path strength = product of hops | Graph embeddings, LLM judgement | Every number on screen can be explained ("overlapped 9 yrs in Wipro's Americas 2 unit while Guha ran it"). Unknown dates lower confidence instead of being guessed. |
| ADR-16 | Paths ranked by strength, but a confirmed direct acquaintance is always shown | Direct ties first | Meeting someone once in 2024 shouldn't outrank a batchmate who worked in their unit for 9 years; but "you've met them" is still worth knowing. |
| ADR-17 | A UPSI caution on any path or suggestion through a current employee of the company | No caution | Real compliance risk for an investor; the network should make the right call easy. |

| ADR-18 | Hybrid classification: ordered text rules → NSE label → bulk LLM only for leftovers | LLM classifies everything | Rules settle 261/290 filings for free and traceably (`rule` field). The LLM handled the 29 vague "General Updates", and found HDFC Bank's CEO handover hidden in one. |
| ADR-19 | The LLM reads only potentially material filings (144/290), 10 per call, and returns headline, one-line summary and a *materiality* judgement | Summarise everything; no LLM | Routine paperwork never costs a token. 15 calls per full refresh, cached by content hash, so re-scoring is free. |
| ADR-20 | Materiality must cite a fact from the filing and is judged against company size (large/mid cap) | Free-text reason | First pass gave generic reasons ("results impact valuation") and rated a USD 2,000 stake "high". Forcing a cited fact plus size context fixed both: no AI slop on the card. |
| ADR-21 | Score = product of explainable factors, squashed by `100·p/(p+0.5)`; tiers top ≥ 66, notable ≥ 36 | Raw product, capped | Raw products piled 95 filings at 100. The squash keeps order and gives 0–4 top stories per day. |
| ADR-22 | Filings about the same company, category and day are grouped into one story | One card per filing | Results day produces 4–6 filings; the investor wants one story with the rest attached. |

| ADR-23 | The Brief opens with a count, not a feed: "Two things matter. 4 worth a glance. 15 routine filings filed away." | Chronological feed, dashboard | States the product thesis on the first screen; the investor knows in one line whether to keep reading. |
| ADR-24 | Three tiers on screen: full cards (top), one-line rows (notable), one collapsed line (routine) | Equal-weight list | Density follows importance, which is what "bury everything else, beautifully" asks for. |
| ADR-25 | Triage by swipe (left done, right later) mirrored by buttons; state per viewer in `localStorage` via `useSyncExternalStore` | Server-side state; gestures only | Triage is a personal convenience, needs no backend for the prototype, and must work without gestures (accessibility). A snooze lasts until the next data snapshot. |
| ADR-26 | One "people" colour (amber) used only for the network, on every surface | Network as a separate tab | The network should feel like a quiet advantage woven into Push, not a contact list beside it. |
| ADR-27 | The web app reads a copy of the snapshot synced into `web/data/` at `predev`/`prebuild`, through one data module (`web/lib/data.ts`) | Reading `../data` at runtime | The Next.js bundle never reaches outside its folder (Vercel root dir = `web`); every page prerenders statically. |

| ADR-28 | Executive profiles come from the appointment filing itself (SEBI requires a "brief profile"), extracted by the bulk model into the network's `Person` schema, 3 filings per call | LinkedIn lookup; reasoning model | Primary, legal source. 12 calls for 35 filings; recalls 11/11 employers against hand-built fixtures (`extract_people.py --eval`). The model never sees the network. |
| ADR-29 | Dates are never invented: a role followed by one that has started is closed (or marked `end_unknown`); a future-dated role doesn't end today's; joining a different group ends the current employer; estimated years shown as "around" | Trust the model's `to: null` | The first extraction left Banga "at TPDDL 2003–present", which would have fabricated overlaps. Honesty beats a stronger-looking path. |
| ADR-30 | Two new kinds of evidence: "same career path" (both moved A → B, counted only where their time could have overlapped) and "joined first" bounded overlap | Only dated overlaps | Recovers real signal when filings omit years (Rohan followed Guha Wipro → Birlasoft) without accepting false ones (both went NTPC → TPREL, 20 years apart). |
| ADR-31 | The path UI shows each hop's own strength, a reason per hop, a UPSI caution, "you've met them", and an explicit negative ("No one in your network has crossed paths with Ritu") | Show only positive matches | The investor can judge the path themselves; silence would hide whether FINN looked. |

| ADR-32 | Results card reads the quarter's XBRL context (a ~3-month duration ending on the quarter date, no dimensions); QoQ and YoY come from the earlier quarters' own filings | Screener table; LLM on the PDF | Numbers straight from the exchange's structured filing. The headline ("Q2 FY27: Revenue +15% YoY, PAT +16% YoY") is computed, not written. |
| ADR-33 | EBITDA = PBT before exceptional items + finance costs + D&A − other income; lenders get their own lines (bank: NII and pre-provision profit; NBFC: EBITDA "not meaningful") | One formula for all | EBITDA means nothing when interest is the cost of goods; showing it would mislead. |
| ADR-34 | Every card carries checks: the profit identity (PBT − tax + JV share + discontinued ops + regulatory deferral = profit) and three cross-checks against Screener; failures are shown, not hidden | Trust the parse | The first run failed 17/82 checks, each a real accounting nuance (JV share below PBT, Ind AS 114 deferrals for power utilities, bank revenue definitions). After the fixes 81/82 pass to the rupee; ITC's gross-vs-net revenue gap is shown on the card as a divergence. |

| ADR-35 | Pull runs live in the web app (TypeScript): Screener fetch + parse for any ticker, with a committed snapshot for the 22 known ones | Python-only Pull; live for all | Any NSE ticker works on demand (verified on ASTRAL and MARICO, which were never fetched by the pipeline); known tickers never depend on Screener being reachable from the host. The TS parser mirrors `screener.py` field for field. |
| ADR-36 | Caching: Screener HTML through the `fetch` cache (`revalidate: 1 day`); known tickers prerendered via `generateStaticParams`; unknown ones render once behind `<Suspense>` with a progress fallback and are then kept | `use cache` only | Per the Next 16 docs, in-memory `use cache` entries don't persist across serverless instances, but the fetch cache does. |
| ADR-37 | The snapshot, trajectory, margins, cash conversion, leverage and working capital are arithmetic in code; each signal names its source table | Ask a model to "analyse" the numbers | Numbers need no model; a model would add cost and risk. The LLM is saved for what needs reading (guidance in transcripts, T09). |
| ADR-38 | Lenders get different lines: net profit margin instead of OPM/financing margin, ROE instead of ROCE, no cash-conversion or D/E | Same template for everyone | Screener's financing margin goes negative for consolidated banks with insurance arms (HDFC Bank showed −12%); D/E and CFO are meaningless when lending is the business. |

| ADR-39 | Promised vs delivered = extract (bulk, one call per transcript, verbatim quote + page) → actuals in code (A-ids) → compare (reasoning, cites only G/A ids) → validator | One long-context "analyse these transcripts" call | Each stage is checkable: quotes are matched against the page text (ASIANPAINT: 3 failed and were dropped); the comparison can only cite ids that exist; numbers never come from the model. |
| ADR-40 | Verdicts include `on_track` / `off_track` for periods still running | met/missed/too_early only | The first run marked everything "too early" (summarising, not analysing). "Positive FY27 growth" against H1 −10% YoY is the call an analyst wants. |
| ADR-41 | Thinking off for bulk extraction, capped for comparison; reasoning chain re-ordered by a latency benchmark (3.6-flash ~3 s; 3.8 overloaded; 3.7 ~360 s; 2.5 retired) | Default model settings | A ticker went from ~220 s to 6–42 s. On 503 the chain moves on instead of queueing. |
| ADR-42 | Live LLM work runs only for real requests (`await connection()`); demo tickers are precomputed by the same code (`scripts/precompute-pull.ts`) into `data/snapshot/pull.json` | Prerender everything; live for all | Without this, every Vercel build would spend ~70 model calls. Precompute makes the demo instant and independent of the API key. |
| ADR-43 | Companies without earnings calls (Trent) get an explicit "no transcripts" message, not an error | Treat as failure | It's a fact about the company, not a fault in FINN. |

### Push ranking factors (`ingest/finn/score.py`)

| Factor | Range | Example reason shown on the card |
|---|---|---|
| Category (+ subtype, seniority) | 0.02–1.0 | "Management change at the top (CEO/MD/CFO level)" |
| Investor preference | 0.3–1.2 | "You asked to see more of these" |
| Position size | 0.75–1.12 | "9% of your portfolio" / "On your watchlist" |
| Network | 1.0–1.1 | "You know people here: Harsh Vora (current, Tata Power Renewable Energy)" |
| Price reaction | 1.0–1.35 | "Stock fell 19.1% on 30.1x usual volume that session" |
| Materiality (LLM read) | 0.4–1.25 | "FINN read the filing: high, secures transmission project worth Rs 243 crore" |

### Network inputs (synthetic in this prototype)

| File | Real-world equivalent |
|---|---|
| `data/network/investor.json` | Onboarding: the investor's own schools and employers |
| `data/network/connections.csv` | LinkedIn "Connections" data export (same columns) |
| `data/network/profiles.json` | Career/education enrichment of each connection, gathered with consent |
| `data/network/interactions.csv` | Calendar / CRM meeting log |
| `config/orgs.json` | Canonical org registry: aliases, subsidiaries → group, NSE symbol |
| `config/company_links.json` | Competitors / suppliers / customers per company, for who-to-call |
