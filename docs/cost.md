# FINN — What it costs to run

Measured, not estimated: Python calls are logged per call to `data/llm_usage.jsonl` (gitignored), and every Pull result carries its own usage in `data/snapshot/pull.json`. Money spent building and running FINN so far: **₹0** (Gemini API free tier).

## Where models are used, and where they are not

| Step | Model | Calls | Why this tier |
|---|---|---|---|
| Classify filings | **none** for 261/290 (rules); bulk for the rest | inside "read filings" | Rules are free and traceable; only vague "General Updates" need reading |
| Read material filings: headline, summary, materiality | bulk (`gemini-3.5-flash-lite`) | 15 per refresh (10 filings per call) | Short structured extraction |
| Executive profiles from appointment filings | bulk | 12 per refresh (3 filings per call) | Structured extraction into the network's schema |
| Results numbers (Revenue, EBITDA, PBT, PAT) | **none** (exchange XBRL) | 0 | Numbers must be exact |
| Network: matching, paths, tie strength, who to call, best person per event, reconnect | **none** | 0 | Deterministic, explainable, and keeps personal data away from any model |
| Research snapshot, trajectory, cash, leverage | **none** | 0 | Arithmetic |
| Promised vs delivered: extract guidance | bulk, thinking off | 4 per ticker (1 per transcript) | Long input, structured output |
| Promised vs delivered: compare + bull/bear | reasoning (`gemini-3.6-flash`), thinking capped at 2k | 1 per ticker | The only step that needs judgement |
| Alerts | **none** | 0 | Thresholds |
| Ask bar | bulk, as a router only | 1 per question | Maps a question to an intent; never reads data |

## Measured usage

**Daily refresh of the 22-company snapshot** (one run of `enrich_filings.py` + `extract_people.py`):

| | Calls | Input tokens | Output tokens |
|---|---|---|---|
| Read 144 material filings | 15 | ~98k | ~18k |
| Extract people from 35 management-change filings | 12 | ~50k | ~13k |
| **Total per refresh** | **27** | **~148k** | **~31k** |

Re-running with unchanged filings costs **0 calls**: every call is cached by a hash of its model tier, prompt and schema. Re-scoring after a weight change used no model at all.

**One "promised vs delivered" research report** (4 earnings calls, 56–81 pages):

| Ticker | Calls | Input | Output | Pages read | Statements extracted | Quotes failing the page check |
|---|---|---|---|---|---|---|
| PIIND | 5 | 47.1k | 5.1k | 81 | 37 | 0 |
| DEEPAKNTR | 5 | 55.4k | 4.9k | 78 | 31 | 0 |
| POLYCAB | 5 | 52.4k | 5.0k | 78 | 35 | 0 |
| CDSL | 5 | 37.4k | 2.4k | 56 | 15 | 0 |
| TATAPOWER | 5 | 44.8k | 4.1k | 79 | 29 | 1 |
| WIPRO | 5 | 34.6k | 3.2k | 62 | 22 | 0 |
| KAYNES | 5 | 54.6k | 4.4k | 81 | 30 | 0 |
| **Average** | **5** | **~47k** | **~4k** | 74 | 28 | |

A live run on a ticker FINN had never seen (ASIANPAINT) read 124 pages in **25 s**, using ~54k tokens; 3 of its quotes failed the page check and were dropped.

**Ask bar**: one bulk call per question (~1–2k tokens), ~1.4 s.

## What made it cheap and fast

1. **Rules before models.** 261 of 290 filings never needed a model to be classified.
2. **Read only what might matter.** Routine paperwork (146 filings) never reaches a model.
3. **Batching.** 10 filings per call for triage, 3 per call for profiles.
4. **Cache everything.** Content-hash cache in both Python and TypeScript; precomputed research for demo tickers ships with the app.
5. **Right model per step.** Flash-Lite with thinking off for extraction; a stronger model only for the one comparison step, with a capped thinking budget.
6. **Measured model choice.** Benchmarking the real comparison prompt changed the routing: `gemini-3.6-flash` answered in ~3 s while `gemini-3.8-flash` was overloaded (503) and `gemini-3.7-flash` took ~360 s. A ticker went from ~220 s to 6–42 s.
7. **Fallback chains instead of retries.** Free-tier quotas are per model; when one model ran out of quota mid-run, the chain moved to the next (`3.5-flash-lite` → `3.1-flash-lite`) without failing the job.
8. **No model at build time.** Live model calls run only for real visitors (`connection()`), otherwise every deploy would spend ~70 calls.

## At production scale

Scaling the measurements: covering 200 companies is ~9× today's refresh (~250 calls, ~1.3M input tokens), and 10 new research reports a day add ~50 calls and ~0.5M tokens, so roughly **300 calls and ~2M input tokens a day**. That is a small Flash-tier bill (check current Gemini pricing); the heavier cost would be the data and hosting, not the models.
