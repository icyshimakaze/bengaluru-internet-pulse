# Validation record

## Pre-launch security audit, 16 October 2026

The [pre-launch security audit](prelaunch-security-audit.md) passed lint, 377 unit tests across 26 files, TypeScript, the production build and 27 browser checks. New coverage includes malicious URLs/text, model grounding/catalog/batch boundaries, rate-limit costs, archive growth, indexed duplicate equivalence and immutable CI dependencies. Both full and production-only npm dependency audits reported zero known vulnerabilities.

## Stored-data engineering audit, 15 October 2026

- Inspected actual Turso rows through isolated audit workflows using existing repository authentication. The initial remote database had zero observations. Fresh collection produced 84 real Bluesky observations; a later full audit inspected all 173 retained items and 107 topics, with no fixture substitution or AI API requests.
- Repaired six confirmed restaurant/music category errors atomically. Reproduced and fixed split named events, terminal relevance mistakes, truncated vacancy labels, address/organizer category leakage, old-first enrichment starvation, and near-copy syndication counting. Details and final live results are recorded in [Data quality audit](data-quality-audit.md).
- `npm test`: 348 tests passed across 24 files. Tests include reordered event paraphrases, conflicting dates/routes/causes/funding amounts, distinct vacancy IDs/seniority, terminal historical repairs, preserved timestamps/history/provenance, deduplication before scoring, bounded queue order, and malformed persisted records. All API provider tests use mocked clients.
- Strict TypeScript, lint, the final production build and all 26 production-browser tests passed after the last repair changes.
- A full-suite attempt run alongside a production build encountered one unexpected Vitest worker exit. The isolated repeat passed all tests without unhandled errors; no failing assertion was suppressed.

## Production SEO and GitHub ingestion repair, 15 October 2026

- `npm run lint`: passed. `npm test`: 322 tests passed across 23 files. Regression checks cover explicit production origins, demo/preview crawl exclusion, worker-limit configuration errors before storage, and remote migrations that reject the SQLite file-header pragma.
- `npm run build`: passed with every AI/provider/model/batch setting absent, the Vercel flag, `SITE_URL` and placeholder database URL/token only. A temporary fetch/HTTP guard recorded no requests with telemetry disabled. Strict TypeScript compilation passed.
- Final production-server smoke checks with all AI settings absent passed for initialized-empty storage and unreachable remote storage, including configured storage without Vercel's system flag. Homepages returned 200 with honest empty/unavailable states; health returned controlled 503 with database `ok` or `unavailable`. All 20 generated browser JavaScript bundles had zero credential/provider-setting/endpoint matches.
- `npm run test:e2e`: all 26 production browser checks passed. Coverage includes page metadata/canonicals/social images, ICO/SVG/Apple icons, production robots/sitemap, nonindexable demo/live-unconfigured topic states, API indexing headers, browser-bundle secrecy, maps/hydration, mobile layouts and loading/error recovery.
- Actual failed Actions logs identified `AI_BATCH_SIZE=20` and `MAX_AI_ITEMS_PER_RUN=40`. Repository Variables were corrected to 10/30 and read back. Configuration-only run [38600653268](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38600653268) passed without ingestion.
- An isolated diagnostic branch verified the real Turso token/connectivity and identified `PRAGMA user_version = 1` as a remotely rejected statement. With the compatibility fix, all six migrations applied successfully in run [38613012388](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38613012388). The existing ledger and migration checksums are preserved.
- The normal main-branch ingestion workflow then completed successfully in run [38615303283](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38615303283), using an explicit free-heuristic override. It committed an honest degraded snapshot: zero observations/topics, GDELT timeouts, Bluesky HTTP 403 and healthy empty Hacker News queries. No API enrichment took place and no AI credits were consumed. Repository provider/model selection was left unchanged.
- Credential-free runner probe [38618462864](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38618462864) isolated the Bluesky search 403 to the cached public host. The official direct AppView host returned a valid HTTP 200 post envelope; the adapter/test contract now uses it without account credentials.
- These local web/workflow fixes still require publishing and redeployment. The previously inspected Vercel deployment served labeled demo data, so its connection to the same live Turso database remains unverified. See [Production audit](production-audit.md) for deployment requirements and remaining source/provider risks.

## First-deployment production audit, 14 October 2026

- Audited the deployed Vercel URL with direct HTTP requests and a headless browser. Health/pulse/topic/hotspot reads returned explicitly labeled demo data; health reported database `not_required`, so remote Turso connectivity and actual Actions collection/enrichment remain unverified. See [Production audit](production-audit.md).
- `npm run lint`: passed. `npm test`: 297 tests passed across 23 files. New regression checks cover production-host validation, canonical/share metadata, bounded database transport, opaque cache namespaces and retained topic briefs during source outages.
- `npm run build`: passed with all worker AI variables absent, only placeholder remote database configuration and the Vercel flag present. The temporary HTTP/fetch guard recorded no requests with telemetry disabled. Metadata and its local PNG require no external service.
- `npm run test:e2e`: all 21 browser tests passed, including metadata/image delivery, missing-topic indexing, generated-bundle secrecy, responsive layouts, hydration, Leaflet mounting/reopening, keyboard/pointer interaction, attribution, tile outage/retry, source links and loading/error recovery. Test expectations account for Next.js root-URL normalization and map panning; the map HTTP probe permits one retry for a reset connection and still exposes HTTP errors unchanged.
- Inspected deployed pages at 320/390/768/1440 pixels: no settled overflow, browser runtime errors or hydration errors. Deployed SSR contained no Leaflet container. Fifteen loaded deployed JavaScript chunks contained no database/AI credential names or AI endpoints; the browser made no direct database/source/AI API requests. OSM tiles loaded during inspection and the outage fallback remains covered by local fixtures.
- Temporary production servers with every AI setting absent exercised initialized-empty and failed remote-connection cases, including a configured database without a Vercel flag. All served honest live empty/error states. Caches remained intact across database changes and did not cross-contaminate reads. All 20 generated JavaScript bundles were additionally scanned with zero secret/provider-configuration matches.
- Local fixes add stable canonical/Open Graph/Twitter metadata with a static share image, configured-database live defaults, eight-second cancellable database requests, database-specific cache namespaces and readable retained briefs during source outages. The deployed demo still needs the fixed revision and live configuration. No live AI request or API credit was used.

## First Vercel deployment boundary, 14 October 2026

- `npm run lint`: passed with no warnings or errors.
- `npm test`: 285 tests passed across 21 files. Regression checks cover Vercel live defaults, absent/invalid worker settings ignored by web reads, worker validation before storage/collection, empty databases, health HTTP statuses and redacted connection failures. API provider tests remain mocked.
- `npm run build`: passed with only placeholder remote Turso URL/token and the Vercel platform flag; all provider keys/models/selection, AI limits, source timeout and HTTP ingestion secret were absent. A temporary HTTP/fetch guard recorded no requests with Next.js telemetry disabled. The build performed no source, AI or database HTTP requests.
- Temporary production servers with no AI settings verified an initialized empty local database and a Vercel-mode failed connection to a closed loopback endpoint. Both homepages returned 200 and showed the empty state. Health returned 503 with application `ok` and database `ok`/`unavailable` respectively; pulse returned honest empty live data, the failed connection exposed the controlled unavailable notice, and unauthenticated ingestion returned 401.
- All 20 generated browser JavaScript bundles were scanned: no OpenAI/xKiro key names or endpoints, Turso URL/token names, provider environment setting or test credential values were present. Production credentials and live provider account access were not used.
- CI now includes a live Vercel build with only database placeholders and the platform flag, alongside the existing provider-selection builds. Deployment documentation lists exactly two required Vercel variables and keeps ingestion configuration in GitHub Actions.

## Independent provider configuration, 13 October 2026

- `npm run lint`, `npm run typecheck` and actionlint: passed.
- `npm test`: 277 tests passed across 21 files. Added mocked coverage for missing/invalid unused provider configuration, selected-provider model/URL validation, redacted configuration fallback, blank GitHub Variables and workflow defaults.
- `npm run build`: passed twice, separately selecting `xkiro` and `openai` with both provider keys and optional model/base URL settings blank. CI now repeats these builds without provider Secrets.
- Manual dispatch defaults to repository provider selection; explicit per-run overrides remain available. No real source/model API requests or API credits were used for this change.

## Multi-provider enrichment, 13 October 2026

- `npm run lint`, `npm run typecheck` and `npm run build`: passed.
- `npm test`: 263 tests passed across 21 files. SDK mocks cover OpenAI/xKiro selection, missing keys/models, vendor prefixes, 401/403/429/5xx, malformed/refused/incomplete output, timeouts, retries, batching, injection isolation, no API-to-API fallback and provider schema consistency. Genuine heuristic tests cover entities, categories, locations, summaries and event distinctions.
- `npm run test:e2e`: all 19 browser tests passed, including responsive layouts, accessibility, maps, hydration and browser/backend request isolation. Tests now own dedicated ports 4317/4318 and never reuse unrelated development servers; the request-boundary check includes xKiro.
- `npm run db:migrate`: migration 6 applied to the existing local database. Tests preserve migration 1–5 checksums and historical mock/OpenAI metadata, validate actual item/model provenance and every invocation's run counters (including repeated capture timestamps), and verify cascading retention and rejected persisted data.
- `npm run ingest -- --fixtures`: passed with isolated fictional data and forced heuristic selection. Existing successful items were not re-enriched or relabeled; no external source or API request was made.
- Actionlint passed. Browser static bundles contain no OpenAI/xKiro key names or API endpoints. All API-client tests used mocks; no real API credits were consumed.
- Local defaults use heuristic processing; the intended scheduled deployment selects xKiro with provider-specific credentials/model configuration. Live xKiro/OpenAI account access was not tested.

## Earlier implementation checks

Scaffold verified on 6 October 2026; relational persistence, public-source ingestion and semantic enrichment verified on 7 October 2026; production scoring v2 and the public read/query layer verified on 8 October 2026, Windows, Node.js 26.8.1. CI is configured for Node.js 22, with the project requiring 22.13 or later.

- `npm install` and clean `npm ci --no-audit --no-fund`: successful; generated lockfile checked for dependency consistency.
- `npm run lint`: passed with zero lint warnings or errors.
- `npm test`: 170 tests passed in 13 files.
- `npm run typecheck`: passed with strict TypeScript and unchecked-index protection.
- `npm run build`: production build passed with all pages and API routes.
- `npm run test:e2e`: 5 tests passed against production servers in demo and unconfigured live modes, including filtered read APIs, redacted models and the browser network boundary.
- Automated WCAG A/AA checks: no violations found on `/`, `/topic/namma-metro` and `/about` at 390px width. This is automated verification, not a complete accessibility certification.
- Desktop/mobile screenshots reviewed for overflow, typography, labels, source coverage, ranking and evidence. The charts expose a keyboard-accessible data table; decorative chart surfaces are removed from tab order.
- `npm run db:migrate`: applied migration 5 to the existing version 4 local database; repeat execution applied no migrations. Integration tests preserve original migration checksums, evidence, v1 scores and capture guards while permitting v2 history at the same timestamp.
- `npm run db:seed`: retained 221 fictional items and six topics in isolated `.data/seed.db`; rerun inserted zero items. Direct integrity inspection confirmed six preserved v1 history rows, six v2 rows and zero foreign-key violations.
- Persistence coverage includes legacy backfill, migration rollback/checksums, all duplicate identities, assignment, filtered queries, hotspot aggregation, atomic publication, run counters and interruption recovery, exact time-window and 14/30-day retention boundaries and fixture isolation.
- Production ingestion output tracing includes all five SQL migration files. Browser static bundles contain no server API key names or OpenAI endpoint.
- `npm run ingest -- --fixtures`: three fictional signals inserted using all three real adapters with injected payloads; repeat inserted zero. Data is confined to marked rows in `.data/ingestion-fixtures.db`.
- Source reliability coverage includes all requested queries/windows/caps, normalized fields/source types, profile removal, original-source links, syndicated fingerprints, repeated-query identities, retry/permanent HTTP errors, rate-limit delays, response-size limits, stalled fetch/body deadlines, partial coverage and complete outages.
- Enrichment coverage uses mocked Responses API results and the offline mock provider: exact production model and strict schema, untrusted-input separation, no tools/response storage, batching, updated active catalogs, invalid IDs/categories/locations/summaries, refusals/incomplete results, transient retry limits, total deadlines, durable pending fallback, cooldowns, three-run caps, queue draining, no repeated successful enrichment, migration upgrades, validated persisted reads and cascading retention. Classification confidence is verified independently from deterministic trend confidence.
- Scoring coverage includes rising-small versus large-stable ordering, exact 2h/6h/24h boundaries, the four weighted components, evidence caps, singleton exclusion, single-source spam, syndicated and transitive duplicates, missing baselines, bounded small-denominator percentages, provider balance, cluster consistency, all six lifecycles, stale/no-data cases, first-seen preservation, deterministic ties and input-order invariance. Relational tests validate v2 telemetry, read-only legacy cache upgrades, version-specific upserts and snapshots for isolated, expired and pruned-evidence topics. Browser checks verify the v2 API contract.
- Read coverage includes consistent read batches, fixture isolation, parameter validation before access, 2h/6h/24h selection, unchanged all-provider scoring under source filters, full-set filtering before topic limits, inactive-topic details, versioned history limits, pending streams, bounded excerpts/evidence, related signals, hotspot means, latest versus successful ingestion, opaque errors, corrupt snapshot identity, unavailable storage, live cache freshness and uncached health probes. Tests verify no public read makes source/model fetches or database writes.
- A temporary production server read the existing `.data/pulse.db` with real Next.js caching: pulse/hotspots returned available stale/degraded data with the original capture timestamp and zero current signals; health returned 503 with database `ok` and stale collection, missing topic returned 404 and invalid window returned 400. Shared cache age increased between different window requests. The server was stopped; no ingestion, source call or paid model request occurred.

## Live smoke test

The latest `npm run ingest` ran the complete pipeline against the public endpoints and exited successfully, publishing a real degraded snapshot in `.data/pulse.db`. Both HN queries returned valid empty recent results. GDELT hit its 35-second total source deadline after bounded retries; all five queries were recorded as failed. All four Bluesky searches had network errors after retries. The ingestion process recorded source health and per-source run counters and persisted zero observations without adding fixture data.

This earlier public-source smoke test verifies failure handling, persistence and source health; it does not establish successful live payload retrieval from all three providers in this environment. Adapter contracts are additionally exercised with checked-in source fixtures. The enrichment verification uses local mocks and mocked SDK responses; no real OpenAI request or charge occurred. At this earlier verification the provider was `mock`. The current multi-provider implementation defaults to heuristic locally and selects xKiro in the scheduled workflow; API failures use only heuristic fallback.

## Tooling notes

ESLint 9 matches the currently bundled Next.js React lint plugin. ESLint 10 was tested and its removed `context.getFilename` API caused the plugin to fail; the working version is locked. npm emits its deprecation notice during dependency installation, while lint itself passes without warnings. The framework, React and remaining packages are resolved in `package-lock.json`.

Windows sandbox restrictions blocked worker process creation in Vitest, tsx and Next.js. Verification was rerun with approved process permissions. These are execution-environment permissions, not application errors or account prerequisites.

## Directory structure

Generated folders (`node_modules`, `.next`, `.cache`, `.data`, `test-results`) are ignored.

```text
bengaluru-internet-pulse/
├── AGENTS.md
├── README.md
├── .env.example
├── .gitattributes
├── .github/workflows/
│   ├── ci.yml
│   └── ingest.yml
├── docs/
│   ├── architecture.md
│   ├── data-sources.md
│   ├── enrichment.md
│   ├── persistence.md
│   ├── read-api.md
│   ├── trend-algorithm.md
│   └── validation.md
├── scripts/
│   ├── env.ts
│   ├── ingest.ts
│   ├── migrate.ts
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── page.tsx, layout.tsx, globals.css, icon.svg
│   │   ├── error.tsx, loading.tsx, not-found.tsx
│   │   ├── about/page.tsx
│   │   ├── topic/[slug]/page.tsx
│   │   └── api/
│   │       ├── pulse/route.ts
│   │       ├── topics/route.ts
│   │       ├── topics/[slug]/route.ts
│   │       ├── hotspots/route.ts
│   │       ├── health/route.ts
│   │       └── ingest/route.ts
│   ├── components/
│   │   ├── dashboard.tsx, charts.tsx
│   │   ├── hotspots.tsx, hotspot-map.tsx
│   │   ├── site-header.tsx, site-footer.tsx
│   │   └── ui/button.tsx, badge.tsx
│   ├── fixtures/demo.ts, public-sources.json
│   └── lib/
│       ├── domain/schema.ts, enrichment.ts, read-models.ts
│       ├── sources/
│       │   ├── adapters.ts, types.ts, collector.ts, http.ts
│       │   └── gdelt.ts, bluesky.ts, hackernews.ts
│       ├── pipeline/normalize.ts, topics.ts, ai.ts, ingest.ts
│       ├── db/
│       │   ├── client.ts, schema.ts, legacy-v1.ts
│       │   ├── records.ts, mapping.ts, data-repository.ts, repository.ts, enrichment-repository.ts, read-repository.ts
│       │   ├── seed.ts
│       │   └── migrations/0001_core.sql, 0002_indexes.sql, 0003_dataset_guards.sql, 0004_semantic_enrichment.sql, 0005_trend_scoring_v2.sql
│       ├── trends/engine.ts, snapshots.ts, compatibility.ts, presentation.ts
│       ├── server/env.ts, logger.ts, read.ts, queries.ts, projections.ts, api.ts, auth.ts
│       └── utils.ts
├── tests/
│   ├── engine.test.ts, normalize.test.ts, http.test.ts
│   ├── sources.test.ts, ingest.test.ts, server.test.ts
│   ├── api.test.ts, ai.test.ts
│   ├── migrations.test.ts, persistence.test.ts
│   ├── enrichment-persistence.test.ts, scoring-persistence.test.ts, read-query.test.ts
│   ├── helpers.ts, database.ts, server-only.ts
│   └── e2e/product.spec.ts
├── package.json, package-lock.json
├── next.config.ts, next-env.d.ts, tsconfig.json
├── eslint.config.mjs, postcss.config.mjs, components.json
├── vitest.config.ts, playwright.config.ts
├── vercel.json
└── .gitignore
```
