# Validation record

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
