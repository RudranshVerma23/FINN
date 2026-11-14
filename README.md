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

cd web
npm install
npm run dev                     # http://localhost:3000
```

## Status

See the release log in [`docs/tasks.md`](docs/tasks.md).
