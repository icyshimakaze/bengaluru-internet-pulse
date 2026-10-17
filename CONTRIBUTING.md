# Contributing

Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), [sources](docs/data-sources.md) and [scoring](docs/trend-algorithm.md) before editing. Use Node.js 22.13+ and `npm ci`; the default labeled demo needs no accounts or keys.

Keep TypeScript strict and validate boundaries with Zod. Public reads must not ingest. Preserve timestamps, deduplication, provider/model provenance and historical mock labels. Add numbered migrations without editing applied SQL/checksums. Change scoring only with an explicit contract review. Never add credentials or real evaluation samples to Git.

Use a focused branch and explain the problem, resulting behavior and checks run. Add behavior tests with synthetic fixtures or mocked clients; tests must never spend API credits. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` (install Chromium first). Existing Windows native-fork caveats and verification records are in [portfolio readiness](docs/portfolio-readiness.md).

Update the relevant docs when a contract changes. Use `npm run screenshot` after a build for demo captures. Human evaluation requires real manual labels; synthetic fixture numbers are never performance claims. Check publisher terms before enabling RSS, and verify OSM provenance before adding a map center.
