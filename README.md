# FINN — Financial Investment Agent

> **An editor, not a feed.** FINN shows an investor the few things that changed and matter, and tells them who in their own network can help them understand it.

Built for the ENAM Holdings *Founding AI Engineer* build challenge. Mobile-first web app with three layers:

- **Push** — a ranked brief of what changed across your portfolio, with configurable alerts.
- **Pull** — research on any NSE ticker, grounded only in annual reports and concall transcripts.
- **Network** — your own contacts, woven into both: *who do I know who can help me understand this?*

## Docs

| Doc | What's in it |
|---|---|
| [`docs/requirements.md`](docs/requirements.md) | Numbered functional (FR) and non-functional (NFR) requirements |
| [`docs/architecture.md`](docs/architecture.md) | System design, data model, LLM routing, privacy, cloud, decision log |
| [`docs/tasks.md`](docs/tasks.md) | Task plan, branch/commit conventions, release log |

## Repository layout

```
config/models.json   model routing shared by Python and TypeScript
ingest/              Python batch pipeline (fetch → classify → score → extract → network)
data/snapshot/       curated data the app reads (committed)
web/                 Next.js mobile-first app (deployed on Vercel)
docs/                requirements, architecture, tasks
```

## Running locally

Requires Python 3.12+ and Node 20+.

```bash
cp .env.example .env            # then add your GEMINI_API_KEY
pip install -r ingest/requirements.txt
python ingest/scripts/smoke_llm.py   # checks the key and model routing
python ingest/scripts/build_snapshot.py --days 30   # refresh data/snapshot/ from NSE + Yahoo
python ingest/scripts/build_network.py --stories    # network.json + print paths to new executives
python ingest/scripts/enrich_filings.py             # classify, read (bulk LLM), score and group filings
python ingest/scripts/extract_people.py --eval      # executive bios from filings + network paths
python ingest/scripts/event_contacts.py             # best person to explain each material event
python ingest/scripts/build_reconnect.py            # dormant contacts with a natural reason to call
python ingest/scripts/build_results.py              # Revenue/EBITDA/PBT/PAT QoQ & YoY from XBRL, with checks
python ingest/scripts/build_fundamentals.py         # Screener tables + document links for known tickers (Pull)

cd web
npm install
npm run dev                     # syncs data/snapshot into web/data, then http://localhost:3000

# precompute "promised vs delivered" for demo tickers (any other ticker runs live)
npx tsx --env-file=../.env scripts/precompute-pull.ts PIIND WIPRO POLYCAB
```

## Status

See the release log in [`docs/tasks.md`](docs/tasks.md).
