# FINN — Task plan and release log

Requirements: [`requirements.md`](requirements.md) · Architecture: [`architecture.md`](architecture.md)

## Conventions

**Branches (git-flow):**
- `main` — released versions only; every merge is tagged `vX.Y.Z`.
- `develop` — integration branch.
- `feature/Txx-short-name` — one branch per task, cut from `develop`, merged back into `develop`.
- `release/vX.Y.Z` — cut from `develop`; merged into `main` (tagged) and back into `develop`.

**Commit messages:**

```
Txx[.n] <type>(<scope>): <summary> [FR-xx, NFR-xx]
```

- `Txx` is the task; `.n` numbers commits within a task when there is more than one.
- `type` is one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.
- The trailing brackets list the requirement IDs the commit delivers.

Example: `T04.2 feat(push): collapse routine filings into one line [FR-04, FR-05]`

## Tasks

| Task | Title | Requirements | Release | Status |
|---|---|---|---|---|
| T00 | Requirements, architecture, task plan, repo scaffold | all (docs), NFR-04, NFR-05, NFR-09 | v0.1.0 | done |
| T01 | Source adapters: NSE filings + results index, Yahoo EOD, Screener | FR-01, FR-02, FR-11, NFR-10 | v0.1.0 | done |
| T02 | Portfolio selection and first data snapshot | FR-01, FR-02, NFR-01 | v0.1.0 | done |
| T03 | Synthetic network, entity resolution, paths, tie strength | FR-18, FR-19, FR-20, FR-21, NFR-05 | v0.1.0 | done |
| T04 | Classification and ranking engine | FR-03, FR-04, FR-05, NFR-04, NFR-07 | v0.1.0 | done |
| T05 | Web app shell and Push digest UI | FR-02, FR-04, FR-10, FR-26, NFR-08 | v0.1.0 | done |
| T06 | Management change card with network path | FR-06, FR-20, FR-21 | v0.1.0 | done |
| — | **Release v0.1.0** — Push + Network working end to end, first deploy | | | |
| T07 | Quarterly results card (QoQ / YoY) | FR-07, NFR-06 | v0.2.0 | done |
| T08 | Pull pipeline for any ticker: fetch, snapshot, trajectory, cache | FR-11, FR-12, FR-13, FR-17, NFR-02, NFR-03 | v0.2.0 | done |
| T09 | Promised vs delivered and bull/bear with citation validator | FR-14, FR-15, FR-16 | v0.2.0 | done |
| T10 | Who to call inside Pull; material event card | FR-08, FR-22 | v0.2.0 | done |
| T11 | Configurable alerts and alert inbox | FR-09 | v0.2.0 | done |
| — | **Release v0.2.0** — Pull working on any ticker, alerts | | | |
| T12 | Reasons to reconnect in the digest | FR-23 | v1.0.0 | done |
| T13 | Person and company pages; Ask bar (stretch) | FR-24, FR-25 | v1.0.0 | todo |
| T14 | Polish: PWA install, dark mode, motion, performance | FR-26, NFR-03, NFR-08 | v1.0.0 | todo |
| T15 | Writeup, architecture diagram, cost report, AI build history | docs | v1.0.0 | todo |
| — | **Release v1.0.0** — submission (tag also `submission-v1`) | | | |

## Release log

### v0.2.0 — Pull for any ticker, results, alerts (2026-11-15)

Tasks T07–T11. New snapshot files: `results.json` (Q2 FY27 for 22 companies), `fundamentals.json` (22 companies), `pull.json` (promised vs delivered for 7 demo tickers).

**What's new**
- **Results card** (FR-07): Revenue, EBITDA, PBT and PAT with QoQ and YoY, read from the exchange's XBRL (no LLM), with a computed headline. Lenders get NII / pre-provision profit. 81/82 accounting checks pass; the one divergence (ITC revenue vs Screener) is shown on the card.
- **Research tab** (FR-11–FR-13, FR-17, NFR-02): any NSE ticker by name or symbol. Snapshot tiles, 10-year trajectory, margins, momentum, cash conversion, leverage and working capital, all computed with the source table named; primary documents listed. Known tickers are instant; others are fetched live (verified on ASTRAL, MARICO, SYRMA, INFY).
- **Promised vs delivered and bull vs bear** (FR-14–FR-16): the last four earnings calls are read, guidance is extracted with verbatim quotes checked against their page, and compared with filed numbers. Verdicts are met / missed / partly / on track / off track, with page-linked sources and a citation validator. Precomputed for 7 tickers; live for others in ~25 s.
- **Who to call** (FR-08, FR-22): material events name the person best placed to explain them (role and subject expertise, not just employer); Research lists who to call for any ticker, with honest negatives.
- **Alerts** (FR-09): volume, price and filing-type thresholds you set, a live recount, likely cause or follow-through for every move, and the last session's moves on the Brief.

**Cost**: Gemini free tier. A full Pull run for one ticker is ~50k tokens (4 bulk calls + 1 reasoning call); results, research tiles, network and alerts use no model at all.

**Known limits**
- Live Pull runs need `GEMINI_API_KEY` on the host and reach Screener/BSE from it; if those are blocked, known tickers still work from the snapshot.
- Live results are cached per server instance, not persistently (a KV store is the next step).
- Alerts run on the snapshot; scheduled evaluation after each close and push notifications are the next step.
- Data is a committed snapshot refreshed by running the ingest scripts locally.

### v0.1.0 — Push + Network, end to end (2026-11-15)

Tasks T00–T06. Data snapshot: 22 companies (18 holdings, 4 watchlist), 290 NSE filings from 16 Oct to 15 Nov 2026, 6 months of end-of-day prices, a 33-person synthetic network.

**What works**
- **The Brief** (FR-02, FR-04, FR-05, FR-10): time windows (24h / 3d / 7d / 30d), opening with a count ("Two things matter"). Top stories are full cards with the price reaction and "why this?"; notable stories are one-line rows; routine filings are collapsed. Triage by swipe or buttons, with undo.
- **Ranking** (FR-03, FR-04): rules classify 261/290 filings; the bulk model reads 144 potentially material ones in 15 batched calls and returns a headline, one-line summary and fact-cited materiality. The score is explainable factor by factor.
- **Management-change card** (FR-06, FR-21): the incoming executive's profile is extracted from the filing itself, with their career line and "your way in" (per-hop strength, reasons, UPSI caution, "you've met them", honest negatives).
- **Network** (FR-18–FR-22): entity resolution, tie strength with reasons, 1st/2nd-degree paths, who-to-call per company, all in code with no LLM.
- **Holdings and company pages**: sparklines marking material sessions, who you know, 30 days of stories.
- **PWA**, light and dark themes, phone-first layout.

**Cost**: Gemini free tier, about 30 bulk calls for a full refresh; re-scoring is free (content-hash cache).

**Known limits**
- Results cards show the filing's summary, not yet Revenue/EBITDA/PBT/PAT with QoQ/YoY (T07).
- No Pull research view yet (T08–T09); "Dig in" opens the company page.
- Alerts thresholds are in config but not yet evaluated or shown (T11).
- Data is a committed snapshot, refreshed by running the ingest scripts locally.
