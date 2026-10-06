# Validation record

Scaffold verified on 6 October 2026; relational persistence verified on 7 October 2026, Windows, Node.js 26.8.1. CI is configured for Node.js 22, with the project requiring 22.13 or later.

- `npm install` and clean `npm ci --no-audit --no-fund`: successful; generated lockfile checked for dependency consistency.
- `npm run lint`: passed with zero lint warnings or errors.
- `npm test`: 52 tests passed in 10 files.
- `npm run typecheck`: passed with strict TypeScript and unchecked-index protection.
- `npm run build`: production build passed with all pages and API routes.
- `npm run test:e2e`: 4 tests passed against production servers in demo and unconfigured live modes.
- Automated WCAG A/AA checks: no violations found on `/`, `/topic/namma-metro` and `/about` at 390px width. This is automated verification, not a complete accessibility certification.
- Desktop/mobile screenshots reviewed for overflow, typography, labels, source coverage, ranking and evidence. The charts expose a keyboard-accessible data table; decorative chart surfaces are removed from tab order.
- `npm run db:migrate`: applied versions 1–3 to the existing local database; repeat run reported no pending migrations.
- `npm run db:seed`: inserted 221 fictional items and six topics in isolated `.data/seed.db`; repeat run inserted zero items.
- Persistence coverage includes legacy backfill, migration rollback/checksums, all duplicate identities, assignment, filtered queries, hotspot aggregation, atomic publication, run counters and interruption recovery, exact time-window and 14/30-day retention boundaries and fixture isolation.
- Production ingestion output tracing includes all three SQL migration files.

## Live smoke test

The CLI ran the complete pipeline against the public endpoints and published a real degraded snapshot in `.data/pulse.db`. Hacker News returned a valid empty recent result. GDELT timed out after bounded retries. Bluesky connections reset (`ECONNRESET`), confirmed with a direct public HTTP probe. The ingestion process completed, recorded individual source failures and persisted zero observations without adding fixture data.

This verifies failure handling, persistence and source health; it does not establish successful live payload retrieval from all three providers in this environment. Adapter contracts are additionally exercised with checked-in source fixtures. Optional AI is tested with mocked structured responses and remains disabled; no paid API call was made.

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
├── .github/workflows/
│   ├── ci.yml
│   └── ingest.yml
├── docs/
│   ├── architecture.md
│   ├── data-sources.md
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
│   ├── fixtures/demo.ts
│   └── lib/
│       ├── domain/schema.ts
│       ├── sources/adapters.ts, http.ts
│       ├── pipeline/normalize.ts, topics.ts, ai.ts, ingest.ts
│       ├── db/
│       │   ├── client.ts, schema.ts, legacy-v1.ts
│       │   ├── records.ts, mapping.ts, data-repository.ts, repository.ts
│       │   ├── seed.ts
│       │   └── migrations/0001_core.sql, 0002_indexes.sql, 0003_dataset_guards.sql
│       ├── trends/engine.ts, snapshots.ts
│       ├── server/env.ts, logger.ts, read.ts, api.ts, auth.ts
│       └── utils.ts
├── tests/
│   ├── engine.test.ts, normalize.test.ts, http.test.ts
│   ├── sources.test.ts, ingest.test.ts, server.test.ts
│   ├── api.test.ts, ai.test.ts
│   ├── migrations.test.ts, persistence.test.ts
│   ├── helpers.ts, database.ts, server-only.ts
│   ├── fixtures/sources.json
│   └── e2e/product.spec.ts
├── package.json, package-lock.json
├── next.config.ts, next-env.d.ts, tsconfig.json
├── eslint.config.mjs, postcss.config.mjs, components.json
├── vitest.config.ts, playwright.config.ts
├── vercel.json
└── .gitignore
```
