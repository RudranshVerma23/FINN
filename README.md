# FINN — Financial Investment Agent

> **An editor, not a feed.** FINN tells an investor the few things that changed and matter, and who in their own network can help them understand it.

**Try it on your phone:** https://finn-ecru.vercel.app &nbsp;·&nbsp; add it to your home screen for the app experience.

Built for the ENAM Holdings *Founding AI Engineer* build challenge. Three layers, woven together:

- **Push** — a ranked brief of what changed across an 18-stock portfolio, results with the numbers, and alerts on thresholds you set.
- **Pull** — research on **any NSE ticker** from its own filings: computed snapshot and trajectory, and *promised vs delivered* from its last four earnings calls.
- **Network** — your contacts as an intelligence layer: a way in to every new executive, the best person to explain each event, who to call about any company, and reasons to reconnect.

## A two-minute tour

1. **Brief** opens with a verdict, not a feed: *"Two things matter."* Switch to **3 days**. Open the **Tata Power** card: Sanjay Banga is the CEO-designate; FINN shows his career (from the filing itself) and **your way in** through Harsh, your IIT-B batchmate who works in Banga's unit today, with a UPSI caution. Swipe a card left when you're done with it.
2. Still on the Brief, find **Kaynes**' joint venture with Vishay: FINN names **Kunal Verma** as best placed to explain it, because he runs semiconductor assembly, not because he once worked at Kaynes. Find a **results** card (HAL, PI Industries): Revenue, EBITDA, PBT and PAT with QoQ/YoY, straight from the exchange XBRL, with the checks it passed.
3. **Research → WIPRO**: tiles, a 10-year trajectory, and **promised vs delivered**: Wipro guided −2% to 0% sequential growth and delivered +1.0% (*met*, three quarters running), each verdict linked to the exact transcript page. Then **PI Industries** for *off track*. Then type a company FINN has never seen, like **Astral**: it is read live.
4. **Alerts**: tap *Edit* and move the volume slider from 2× to 4×; the inbox recounts instantly. *"PIIND fell 19.1% on 30× volume · likely cause: Q2 FY27, PAT −63% YoY."*
5. **People**: tap a theme in *What your network knows*, open **Harsh Vora** to see everywhere he can help, then ask *"who knows semiconductors?"*.

## How it works

```
NSE filings · Yahoo EOD · Screener · transcripts ──▶ Python batch pipeline (after the close)
   rules classify 261/290 filings · bulk LLM reads the 144 that might matter · XBRL results (no LLM)
   network engine in code: matching, paths, ties, who to call, reconnect (no LLM)
                                   │
                                   ▼  committed snapshot (data/snapshot/)
                     Next.js PWA on Vercel ── Brief · Alerts · People (static, instant)
                                           └─ Research for any ticker (live, cached)
                                           └─ Ask bar (LLM routes the question; code answers)
```

- **Models only where judgement over text is needed**: Gemini 3.5 Flash-Lite for bulk extraction, 3.6 Flash for the one comparison step. A daily refresh is 27 calls; a research report is 5. **₹0 spent** (free tier). See [`docs/cost.md`](docs/cost.md).
- **Grounded**: every model claim on the Pull side cites a quote that is checked against its page, or a number computed in code; unsupported claims are dropped and counted.
- **Private by design**: contacts, relationships and notes never reach a model. The network here is **synthetic**; the executives and their careers come from real NSE filings.

Full design, privacy, cloud and 52 decision records: [`docs/architecture.md`](docs/architecture.md).

## Docs

| Doc | What's in it |
|---|---|
| [`docs/writeup.md`](docs/writeup.md) | Submission note: what I built, decisions and tradeoffs, architecture, what I left out, what's next |
| [`docs/architecture.md`](docs/architecture.md) | Diagram, components, data model, LLM routing, privacy, cloud, decision log (ADR-01…52) |
| [`docs/requirements.md`](docs/requirements.md) | Numbered functional (FR) and non-functional (NFR) requirements |
| [`docs/tasks.md`](docs/tasks.md) | Task plan T00–T15 mapped to requirements, git conventions, release notes |
| [`docs/cost.md`](docs/cost.md) | Measured model calls and tokens per refresh and per research report |

## Repository layout

```
config/          model routing (shared by Python and TypeScript), portfolio, preferences, org registry
ingest/          Python batch pipeline: sources → classify → read → score → results → people → network
data/network/    the investor's network inputs (synthetic): connections export, profiles, interaction log
data/snapshot/   everything the app reads (committed, so the demo never depends on a live source)
web/             Next.js 16 mobile-first PWA (Vercel root directory)
docs/            requirements, architecture, tasks, cost, writeup
```

## Running locally

Requires Python 3.12+ and Node 20+. Secrets live in one root `.env` (gitignored), read by both halves.

```bash
cp .env.example .env                                   # add GEMINI_API_KEY
pip install -r ingest/requirements.txt

# refresh the snapshot (in this order)
python ingest/scripts/build_snapshot.py --days 30      # NSE filings + Yahoo EOD + results index
python ingest/scripts/build_network.py                 # network snapshot (synthetic inputs)
python ingest/scripts/enrich_filings.py                # classify, read (bulk LLM), score, group into stories
python ingest/scripts/extract_people.py --eval         # executive profiles from filings + paths
python ingest/scripts/event_contacts.py                # best person per material event
python ingest/scripts/build_results.py                 # results from XBRL, with checks
python ingest/scripts/build_reconnect.py               # reasons to reconnect
python ingest/scripts/build_fundamentals.py            # Screener tables for known tickers

cd web
npm install
npx tsx --env-file=../.env scripts/precompute-pull.ts PIIND WIPRO   # optional: precompute research
npm run dev                                            # http://localhost:3000
```

The committed snapshot already contains all of this, so `cd web && npm install && npm run dev` is enough to run the app.

## How this was built

Git-flow with one numbered commit per step (`T07.2 feat(push): … [FR-07, NFR-06]`), feature branches merged into `develop`, releases `v0.1.0` → `v0.2.0` → `v1.0.0` on `main`. Built with Claude Code; the session history is part of the submission.
