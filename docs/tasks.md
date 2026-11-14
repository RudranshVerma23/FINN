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
| T02 | Portfolio selection and first data snapshot | FR-01, FR-02, NFR-01 | v0.1.0 | todo |
| T03 | Synthetic network, entity resolution, paths, tie strength | FR-18, FR-19, FR-20, FR-21, NFR-05 | v0.1.0 | todo |
| T04 | Classification and ranking engine | FR-03, FR-04, FR-05, NFR-04, NFR-07 | v0.1.0 | todo |
| T05 | Web app shell and Push digest UI | FR-02, FR-04, FR-10, FR-26, NFR-08 | v0.1.0 | todo |
| T06 | Management change card with network path | FR-06, FR-20, FR-21 | v0.1.0 | todo |
| — | **Release v0.1.0** — Push + Network working end to end, first deploy | | | |
| T07 | Quarterly results card (QoQ / YoY) | FR-07, NFR-06 | v0.2.0 | todo |
| T08 | Pull pipeline for any ticker: fetch, snapshot, trajectory, cache | FR-11, FR-12, FR-13, FR-17, NFR-02, NFR-03 | v0.2.0 | todo |
| T09 | Promised vs delivered and bull/bear with citation validator | FR-14, FR-15, FR-16 | v0.2.0 | todo |
| T10 | Who to call inside Pull; material event card | FR-08, FR-22 | v0.2.0 | todo |
| T11 | Configurable alerts and alert inbox | FR-09 | v0.2.0 | todo |
| — | **Release v0.2.0** — Pull working on any ticker, alerts | | | |
| T12 | Reasons to reconnect in the digest | FR-23 | v1.0.0 | todo |
| T13 | Person and company pages; Ask bar (stretch) | FR-24, FR-25 | v1.0.0 | todo |
| T14 | Polish: PWA install, dark mode, motion, performance | FR-26, NFR-03, NFR-08 | v1.0.0 | todo |
| T15 | Writeup, architecture diagram, cost report, AI build history | docs | v1.0.0 | todo |
| — | **Release v1.0.0** — submission (tag also `submission-v1`) | | | |

## Release log

_Filled in at each release._
