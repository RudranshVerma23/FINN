# FINN — Requirements

Status: v1 (T00) · Owner: Rudransh Verma · Last updated: 2026-11-15

Every requirement has an ID. Tasks in [`tasks.md`](tasks.md) and every commit message reference these IDs, so you can trace any line of code back to the requirement it serves.

**Priority:** `P0` must ship in v0.1/v0.2 · `P1` should ship by v1.0 · `P2` stretch / documented as next step.

---

## 1. Product thesis

> **FINN is an editor, not a feed.**
> An investor doesn't need more information; they need the few things that matter, ranked, with one question already answered: *who do I know who can help me understand this?*

Every surface answers three things: **what changed · why it matters to me · who I know**.

---

## 2. Functional requirements

### Push — FINN reaches out

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The investor has a mock portfolio of 15–20 NSE-listed companies (with position weights) and a research watchlist of 3–5 companies. | P0 |
| FR-02 | **Windowed digest:** the investor picks a time window (default last 24h; 3d, 7d, custom). FINN lists every exchange filing across the portfolio in that window. | P0 |
| FR-03 | Each filing is classified into one of the reference categories (results, M&A, management_change, …, unclassified). Rules first; an LLM only for filings the rules can't place. | P0 |
| FR-04 | Filings are **ranked** by a transparent score. Routine filings are collapsed into a single expandable line ("34 routine filings"). Every card shows *why you're seeing this*. | P0 |
| FR-05 | Per-category treatment: material categories get a one-line summary; routine categories surface as the filing title only, at the right priority. | P0 |
| FR-06 | **Management change card:** who joined or left, in what role, a short bio of the incoming person (from the filing itself), and whether anyone in the network worked or studied with them, or is one connection away — with the strength of that link. | P0 |
| FR-07 | **Quarterly results card:** Revenue, EBITDA, PBT, PAT for the quarter, with QoQ and YoY change, taken from the actual results filing. | P0 |
| FR-08 | **Material event card** (M&A, capex, litigation): points to the person in the network best placed to give context, and why. | P1 |
| FR-09 | **Triggered alerts:** configurable thresholds evaluated on end-of-day data — volume ≥ N× its recent average, absolute price move ≥ X% in a day, and subscribed announcement categories. Alerts land in an inbox. | P0 |
| FR-10 | **Triage actions** on every card: dismiss, snooze, dig in. "Dig in" opens the Pull research view for that company. | P1 |

### Pull — the investor asks FINN to dig in

| ID | Requirement | Priority |
|---|---|---|
| FR-11 | Research works on **any NSE ticker** with documents available: FINN resolves the ticker, fetches the latest annual report and the last four concall transcripts, plus multi-year financials. No per-ticker code. | P0 |
| FR-12 | **Financial snapshot:** revenue, margins, PAT and key ratios at a glance — computed in code, not by an LLM. | P0 |
| FR-13 | **Trajectory:** multi-year direction of revenue, margin and profit, as a compact chart. | P1 |
| FR-14 | **Promised vs delivered:** for the last four quarters, management's explicit guidance is extracted, compared against reported actuals, and given a verdict per item (met / missed / pending), each with a citation. | P0 |
| FR-15 | **Bull vs bear:** a short, cited case each way. | P1 |
| FR-16 | **Grounding:** every LLM-generated claim on the Pull side cites a source document and page. Claims without a citation are dropped by a validator. No news, broker notes or model background knowledge. | P0 |
| FR-17 | A new ticker shows step-by-step progress; previously researched tickers load instantly from cache. | P0 |

### Network — who can help me understand this

| ID | Requirement | Priority |
|---|---|---|
| FR-18 | **Network input:** the investor provides contacts (in the shape of a LinkedIn connections export), an interaction log (last met, context) and their own background (alma maters, past employers). | P0 |
| FR-19 | **Person model:** career stints (organisation, role, from–to), education, expertise tags. Covers both network contacts and people who appear in filings. | P0 |
| FR-20 | **Entity resolution:** a name in a filing is matched to people in the network using name similarity, overlapping employer and time, and shared education. Every match shows a confidence score and its evidence. | P0 |
| FR-21 | **Paths and tie strength:** first- and second-degree paths to any person, with a tie strength explained in words ("overlapped 3 yrs at HDFC Bank, same team"). | P0 |
| FR-22 | **Who should I call:** for a company, the people in the network who worked there, at a competitor, a supplier or a customer — and what they would likely know. Shown inside Pull. | P1 |
| FR-23 | **Reasons to reconnect:** contacts not spoken to recently whose current or former employer appears in today's events, surfaced inside the digest. | P1 |
| FR-24 | **Direct query:** person and company pages that show network overlaps and career paths. | P1 |

### Ask and platform

| ID | Requirement | Priority |
|---|---|---|
| FR-25 | **Ask bar:** a free-form question ("who do I know at Tata Motors' suppliers?") answered by an agent that calls FINN's own tools, with sources cited. | P2 |
| FR-26 | **Mobile-first web app**, installable to the home screen (PWA), usable on a phone from one link. | P0 |

---

## 3. Non-functional requirements

| ID | Requirement | Measure |
|---|---|---|
| NFR-01 | **Demo reliability** — the app is fully usable from the committed data snapshot even if every live source (BSE, NSE, Screener, Gemini) is down. | All P0 flows work offline from the snapshot. |
| NFR-02 | **Generalisation** — Pull works for tickers outside the demo set. | Verified on ≥ 2 tickers we didn't pick. |
| NFR-03 | **Latency** | Digest < 1 s · cached research < 2 s · new ticker < 90 s with visible progress. |
| NFR-04 | **Cost and quota** — runs within the Gemini free tier. Every LLM call is cached by content hash, classification is batched, models fall back down a chain (quotas are per model), and token usage is logged. | ₹0 spend; measured usage in [`cost.md`](cost.md). |
| NFR-05 | **Privacy** — no personal network data (names, relationships, notes) is sent to an LLM; matching and paths run in code. Synthetic people only. Secrets never enter the repo. | Audit of prompts in code review; `.env` gitignored. |
| NFR-06 | **Numerical accuracy** — financial figures come from structured data where it exists. LLM-extracted numbers are checked (e.g. PBT − tax ≈ PAT) and labelled as extracted. | No unlabelled LLM numbers in the UI. |
| NFR-07 | **Explainability** — every rank, match and tie strength can show its reason. | "Why" available on every card. |
| NFR-08 | **Mobile UX quality** — designed for 360–430 px, touch targets ≥ 44 px, works on iOS Safari and Android Chrome, light and dark themes. | Manual check on both. |
| NFR-09 | **Maintainability** — data access sits behind one layer (snapshot today, Postgres tomorrow); shared schemas; model routing in one config file. | Swapping the data store touches one module. |
| NFR-10 | **Source compliance** — no LinkedIn scraping; polite, rate-limited requests with an identifying user agent; only publicly available filings and documents. | Documented in [`architecture.md`](architecture.md) (sources, ADR-07, ADR-08). |

---

## 4. Explicitly out of scope (and why)

- **Real people's personal data / LinkedIn scraping** — against platform terms; synthetic profiles prove the mechanism.
- **Intraday or real-time prices** — the brief asks for end-of-day data.
- **Login, multi-user accounts** — single demo investor; production auth is described in the architecture doc.
- **Native app-store builds** — a PWA link is the lowest-friction way to try FINN on a phone.
- **Secondary sources on the Pull side** (news, broker notes) — excluded by the brief, and on purpose.
