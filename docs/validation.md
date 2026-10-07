# Validation record

Scaffold verified on 6 October 2026; relational persistence, public-source ingestion and semantic enrichment verified on 7 October 2026, Windows, Node.js 26.8.1. CI is configured for Node.js 22, with the project requiring 22.13 or later.

- `npm install` and clean `npm ci --no-audit --no-fund`: successful; generated lockfile checked for dependency consistency.
- `npm run lint`: passed with zero lint warnings or errors.
- `npm test`: 117 tests passed in 11 files.
- `npm run typecheck`: passed with strict TypeScript and unchecked-index protection.
- `npm run build`: production build passed with all pages and API routes.
- `npm run test:e2e`: 4 tests passed against production servers in demo and unconfigured live modes.
- Automated WCAG A/AA checks: no violations found on `/`, `/topic/namma-metro` and `/about` at 390px width. This is automated verification, not a complete accessibility certification.
- Desktop/mobile screenshots reviewed for overflow, typography, labels, source coverage, ranking and evidence. The charts expose a keyboard-accessible data table; decorative chart surfaces are removed from tab order.
- `npm run db:migrate`: applied migration 4 to the existing version 3 local database, preserving prior migration checksums and data; repeat execution is covered by integration tests.
- `npm run db:seed`: inserted 221 fictional items and six topics in isolated `.data/seed.db`; repeat run inserted zero items.
- Persistence coverage includes legacy backfill, migration rollback/checksums, all duplicate identities, assignment, filtered queries, hotspot aggregation, atomic publication, run counters and interruption recovery, exact time-window and 14/30-day retention boundaries and fixture isolation.
- Production ingestion output tracing includes all four SQL migration files.
- `npm run ingest -- --fixtures`: three fictional signals inserted using all three real adapters with injected payloads; repeat inserted zero. Data is confined to marked rows in `.data/ingestion-fixtures.db`.
- Source reliability coverage includes all requested queries/windows/caps, normalized fields/source types, profile removal, original-source links, syndicated fingerprints, repeated-query identities, retry/permanent HTTP errors, rate-limit delays, response-size limits, stalled fetch/body deadlines, partial coverage and complete outages.
- Enrichment coverage uses mocked Responses API results and the offline mock provider: exact production model and strict schema, untrusted-input separation, no tools/response storage, batching, updated active catalogs, invalid IDs/categories/locations/summaries, refusals/incomplete results, transient retry limits, total deadlines, durable pending fallback, cooldowns, three-run caps, queue draining, no repeated successful enrichment, migration upgrades, validated persisted reads and cascading retention. Classification confidence is verified independently from deterministic trend confidence.

## Live smoke test

The latest `npm run ingest` ran the complete pipeline against the public endpoints and exited successfully, publishing a real degraded snapshot in `.data/pulse.db`. Both HN queries returned valid empty recent results. GDELT hit its 35-second total source deadline after bounded retries; all five queries were recorded as failed. All four Bluesky searches had network errors after retries. The ingestion process recorded source health and per-source run counters and persisted zero observations without adding fixture data.

This earlier public-source smoke test verifies failure handling, persistence and source health; it does not establish successful live payload retrieval from all three providers in this environment. Adapter contracts are additionally exercised with checked-in source fixtures. The enrichment verification uses local mocks and mocked SDK responses; no real OpenAI request or charge occurred. The default provider is `mock`, including the scheduled workflow.

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
│       ├── domain/schema.ts, enrichment.ts
│       ├── sources/
│       │   ├── adapters.ts, types.ts, collector.ts, http.ts
│       │   └── gdelt.ts, bluesky.ts, hackernews.ts
│       ├── pipeline/normalize.ts, topics.ts, ai.ts, ingest.ts
│       ├── db/
│       │   ├── client.ts, schema.ts, legacy-v1.ts
│       │   ├── records.ts, mapping.ts, data-repository.ts, repository.ts, enrichment-repository.ts
│       │   ├── seed.ts
│       │   └── migrations/0001_core.sql, 0002_indexes.sql, 0003_dataset_guards.sql, 0004_semantic_enrichment.sql
│       ├── trends/engine.ts, snapshots.ts
│       ├── server/env.ts, logger.ts, read.ts, api.ts, auth.ts
│       └── utils.ts
├── tests/
│   ├── engine.test.ts, normalize.test.ts, http.test.ts
│   ├── sources.test.ts, ingest.test.ts, server.test.ts
│   ├── api.test.ts, ai.test.ts
│   ├── migrations.test.ts, persistence.test.ts
│   ├── enrichment-persistence.test.ts
│   ├── helpers.ts, database.ts, server-only.ts
│   └── e2e/product.spec.ts
├── package.json, package-lock.json
├── next.config.ts, next-env.d.ts, tsconfig.json
├── eslint.config.mjs, postcss.config.mjs, components.json
├── vitest.config.ts, playwright.config.ts
├── vercel.json
└── .gitignore
```
