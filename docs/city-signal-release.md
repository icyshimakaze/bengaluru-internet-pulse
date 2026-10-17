# City signal edition — implementation and release review

17 October 2026. The implementation preserves Next.js, Turso, GitHub Actions, server-only ingestion, strict TypeScript/Zod validation and deterministic scoring. No account, paid service, Reddit source or new local-demo deployment requirement was added.

## What the audit established

- At 21:38 IST, production's database was healthy but the last published collection was 18:46 IST. All three collection timestamps were genuinely older than 90 minutes. An empty 2h view was not the cause of that age.
- [Public workflow history](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/workflows/ingest.yml) showed roughly 2–4½-hour gaps between successful scheduled runs despite a twice-hourly UTC cron. The latest job passed configuration and ingestion. This establishes scheduler gaps, not missing credentials.
- GDELT failed independently; a direct audit request returned HTTP 429. Bluesky returned partial coverage and HN completed. External throttling remains an actual limitation.
- A later collection published at 22:01 IST, while initial pulse/topic reads still served 18:46 IST data. Health and hotspots already saw the newer collection. The read cache needed a bounded recovery path.
- API enrichment was limited to 30 items per run, including when collection returned far more. Exhausted retries and low-confidence responses could leave processable items pending. Collection health was also inferred from publication-dependent run records.
- The old 1920px layout occupied only 1200px. Long operational copy, an empty narrow-window ranking and large unused regions weakened the first visit.

## Reliability and contracts

Migration 0007 preserves historical source success and adds independent collection checkpoints. A successful empty poll is Live. Live lasts 45 minutes, Delayed to 90 minutes, then Stale; a failed/partial poll with recent successful coverage is Degraded, while failure without recent success is Error. Missing history/configuration is Unavailable. Every source exposes attempt, success, last-item and error timestamps, a safe error code and the last accepted count. Publication failures cannot erase collection success. Enrichment does not decide source availability.

The selected API still receives at most 30 items. A genuine, local-only heuristic recovery pass handles up to 500 additional/missing or exhausted pending items. Low-confidence API results also use this heuristic. Batch failures isolate individual unprocessable inputs; raw evidence is retained. Results are validated before one atomic persistence batch. Stable topic IDs, per-item provider/model, selected/actual run providers and fallback counters remain explicit. OpenAI, xKiro vendor/model IDs and historical mock provenance are preserved. Corrupted/ambiguous inputs can remain unresolved and outside scores.

NOW selects the shortest window with qualifying topics, then observed evidence. The actual window is always labeled; explicit 2H/6H/24H stays fixed. Scores still measure the latest 2h. All candidate windows share one engine evaluation. The 24h total ages at read time. The 15-second cache now attempts a direct DB read when cached data is over 30 seconds old and preserves validated evidence with an honest notice if recovery fails. Public reads never collect.

## Design, motion and responsive behavior

[Research and attribution](design-research.md) cover Linear, Vercel, Resend, The Pudding, Our World in Data, Observable, Reuters' semantic chart-colour principles, Webby winners and accessible Awwwards collection results. The resulting design is original: paper, forest ink, editorial rules and evidence-first composition.

The exact background remains **#f8f7f2**. A twelve-column grid puts a large lead and supporting ranked rows beside a city briefing. At 1920px the data region is 1760px (91.7%); at 1440px it is 1354px. The chart/city region has its own 8:4 proportions, source evidence spans the full data width, and methodology retains a controlled reading measure inside the wider grid. Tablet moves the briefing below rankings; mobile prioritizes status, lead, supporting topics, chart, map and evidence. No horizontal overflow was measured at 1920, 1600, 1440, 1280, 1024, 768, 430 or 390px. Browser accessibility coverage also includes 320px.

Instrument Sans variable plus IBM Plex Mono are self-hosted through `next/font/local` with OFL licenses. A native status drawer separates collection, enrichment, database and publication. Search, category/provider/time controls, source-type browsing and keyboard neighborhood selection remain functional. Topic briefs add canonical Web Share/clipboard sharing and dynamic, timestamped social images with actual metrics and demo/stale labels.

Motion uses short control transitions, staggered topic arrival, scroll arrival, score movement, link arrows, map selection and a 500ms chart reveal. Text retains full contrast during movement. Reduced motion removes these effects and Recharts animation. The final chart peak label is placed within the plot rather than clipped at its last point. Chart tables, visible focus, native dialog focus restoration/Escape, original links and map attribution remain accessible.

## Visual evidence

All after captures below use **clearly labeled fictional demo data**, not fabricated production observations. Full eight-size captures and measurements are retained locally under ignored `artifacts/release/`.

| Before | After |
| --- | --- |
| [Production before, 1920px](assets/edition/before-desktop.png) | [Wide edition, 1920px](assets/edition/desktop.png) |
| Narrow 1200px data shell | [Mobile composition, 390px](assets/edition/mobile.png) |
| Long operational notice | [Separated system status](assets/edition/status.png) |
| Unshareable presentation | [Topic brief](assets/edition/topic.png), [actual generated share image](assets/edition/social.png) |

The QA loop found and corrected a 1024px neighborhood overflow, low-contrast rank text, opacity-induced transient contrast failures and a clipped terminal chart annotation. Screenshots were inspected after loading deferred charts; visual checks were not limited to source inspection or one implementation pass.

## Performance and validation

Local production measurements at 1440×950 (decoded script bodies, gzip estimates; not field Core Web Vitals):

| Route | JavaScript | Gzip estimate | Heavy assets |
| --- | ---: | ---: | --- |
| Home | 563,668 B | 170,374 B | No Recharts or Leaflet initially |
| Topic | 884,273 B | 261,358 B | Visible chart loads; no Leaflet |
| Methodology | 491,750 B | 147,969 B | No chart or map |

The two browser font files total 44,800 B and make no third-party font request. Social-image TTF stays server-side. Homepage chart history stays compact; Leaflet JS/CSS load only when the street map opens. Recovery persistence uses bounded SQL batching rather than per-item network round trips. The read-only collection check adds two bounded queries on migrated databases; remote latency has not been benchmarked.

- `npm run lint`: passed, zero warnings.
- `npm test -- --maxWorkers=1`: **409 tests passed in 29 files**. Serial workers avoid an intermittent native Windows fork shutdown seen under parallel local runs; no test is skipped or disabled.
- `npm run build`: passed on Next.js 16.3.8, including TypeScript and dynamic share-image route.
- Full Playwright integration suite: **33 passed**, including WCAG A/AA, keyboard behavior, source links, filters/races, empty/unconfigured mode, maps, share images, reduced motion, responsive sizes, bundle budgets, credential exclusion and layout shift below 0.01.
- A focused chart/performance rerun checks the last annotation adjustment and its bounds.
- `git diff --check`: passed.

New/expanded regression coverage lives in `collection-health`, `read-query`, `ai`, `sources`, enrichment persistence/migrations and `e2e/edition.spec.ts`. Source-health rendering, existing topic/evidence tests and browser metadata/performance checks were updated to the new contracts.

## Changed areas and preserved work

- Reliability: `src/lib/domain/{source-health,read-models,enrichment-providers}`, `src/lib/db/{collection-repository,enrichment-repository,read-repository,schema}`, migration 0007, ingestion/classification, source collector, projections/read queries and window selection.
- Product: app layout/global/pulse styles, fonts, loading, homepage/dashboard, header/footer/status, source stream, charts, neighborhoods, source health, topic briefs/sharing and `/api/og/[slug]`.
- Documentation: design research, architecture, source/enrichment/read contracts, homepage/topic behavior, scheduling audit and this release review. `scripts/visual-audit.mjs` reproduces viewport captures.
- Existing related UI/evidence work was preserved and integrated. Pre-existing README/recruiter-review edits and unrelated image artifacts are left in the workspace rather than bundled blindly into the implementation commits.

## Production follow-up

GitHub scheduling gaps, GDELT throttling and the precise private xKiro error are external constraints. No stale evidence is relabeled live. The repository schedule/concurrency remain intact; local demo requires no accounts. A successful scheduled or manual ingestion runs the migration automatically. The web layer tolerates the database before that migration.

**Published with explicit user approval.** Commit `3d16545` was pushed to `main`, and [Vercel reported a successful production deployment](https://vercel.com/icy-shimakaze/bengaluru-internet-pulse/7SLXPk8Jo14E2STBKjfofrVBA1dt). The [public production URL](https://bengaluru-internet-pulse.vercel.app/) serves the new layout and NOW read contract. The earlier automatic approval boundary was resolved by the user's “Approve publish and verify” response.

[Release CI passed](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/39052112717), including workflow validation, lint, 409 unit tests, builds with xKiro/OpenAI selected without API credentials, a live-mode build with database-only settings, TypeScript and all 33 Playwright tests.

The approved [manual production ingestion](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/39052166018) also succeeded. Its one-run heuristic override used no model credits and did not change the scheduled repository provider. The worker applied the new migration, processed 42 signals with actual heuristic provenance and reduced pending enrichment from **16 to 0**. Publication completed at **17:05:55 UTC / 22:35:55 IST**. The dashboard and health endpoint agreed on the **17:05:05 UTC / 22:35:05 IST** collection snapshot.

| Source | Actual post-release result | Last successful collection | Latest item timestamp |
| --- | --- | --- | --- |
| Bluesky | Live; 90 accepted, all four queries completed | 17:05:05 UTC | 16:52:24 UTC |
| Hacker News | Live; one accepted result already stored, no new duplicate counted | 17:05:05 UTC | 19:27:14 UTC on 16 October |
| GDELT | Error; bounded timeout, zero accepted | No recorded success | No recorded item |

This verifies quiet-but-healthy semantics: HN remains Live even though its newest matching evidence is old and repeated polling adds no signal. Two sources are available; GDELT remains honestly unavailable. `/api/health` returns 503 for degraded overall coverage while reporting a healthy database, and `/api/pulse` returns the validated available evidence. NOW selected a labeled 2H window with three qualifying topics and 157 distinct observed signals over 24H at verification time; these counts will age and change.

The production screenshot audit passed at all eight specified widths: no horizontal overflow, exact `#f8f7f2` background, 1760px data region at 1920px. The [live desktop](assets/edition/production-desktop.png), [live mobile](assets/edition/production-mobile.png) and [live status](assets/edition/production-status.png) captures use actual production evidence, separately from the demo design examples above. The status drawer showed two Live sources, GDELT Error, a healthy database and zero pending items. Full local captures are retained under `artifacts/production-release/` and `artifacts/production-verified/`. The audit helper now scrolls the topic's actual `.snapshot-plot` before capturing its deferred chart.

Live browser checks exercised search/empty states, 24H/category/source reads, source-type browsing, the status drawer, Escape dismissal, map navigation and lazy Leaflet, actual topic/history pages, canonical clipboard sharing, the 1200×630 share image and methodology. Production homepage, topic and methodology WCAG A/AA scans reported no violations. The signed-out GitHub destination returned 200. Source links retained the actual persisted Bluesky URLs; direct Bluesky page/API verification from this workstation returned connection resets, so external destination availability is not claimed. Current-window location evidence was absent and the live map correctly showed no invented markers; marker keyboard behavior passed in the full fixture integration suite.

Workstation networking also produced intermittent Chromium DNS failures and read timeouts during repeated probes. Independent production reads completed in about 1.9–4.8 seconds in a small diagnostic sample; this is not a field performance benchmark. A timed-out UI read preserved the last snapshot and exposed its retry notice. These limits remain explicit rather than being hidden by routing tests to fixture responses. Heuristic topic labels and categories can remain coarse, especially for multilingual or syndicated posts.

Post-release review of the previous xKiro run's sanitized logs found three `ENRICHMENT_INVALID_OR_UNAVAILABLE` errors, followed by genuine heuristic fallback. These logs do **not** establish rate limiting, bad credentials or a particular vendor outage; the precise upstream cause remains unconfirmed. GitHub scheduling gaps and GDELT timeouts also remain external constraints. No required manual GitHub or Vercel action remains for this release.
