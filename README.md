# Bengaluru Pulse

**The city's internet, compressed into one pulse.**

A momentum detector for Bengaluru's public internet. GDELT, Bluesky public AppView and Hacker News Algolia feed a validated, deduplicated pipeline. A deterministic engine ranks rising topics; every score links to its evidence and component weights.

Scoring v2 compares the current two hours with the previous two hours. Bounded velocity (40%), logarithmic volume (25%), source diversity (20%) and recency (15%) produce a 0–100 Pulse Score. Confidence is separate; duplicate, single-source and sparse-evidence guardrails prevent inflated momentum. Six deterministic lifecycle states and versioned ingestion snapshots make changes inspectable. All equations and thresholds are in [Trend algorithm](docs/trend-algorithm.md).

## Run

Node.js 22.13 or later.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The default **demo mode** uses explicitly fictional fixtures, runs the actual scoring engine, and needs no accounts or environment file. `/topic/namma-metro` shows scoring and evidence; `/about` documents methodology and limitations.

## Local live collection

Copy `.env.example` to `.env.local`, set `APP_DATA_MODE=live` and keep `TURSO_DATABASE_URL=file:.data/pulse.db`. No source API keys are needed. Run:

```sh
npm run db:migrate
npm run ingest
npm run dev
```

The ingestion command automatically migrates the schema too. Poll regularly to build a baseline; first-run rankings have limited history. Public sources can fail or return no matches. Live mode always reports these conditions and never substitutes demo evidence.

`npm run ingest` also works without an environment file, defaulting to local `.data/pulse.db` and **free mock enrichment**. For an offline end-to-end collection check, run `npm run ingest -- --fixtures`; it uses the same three adapters and enrichment/persistence pipeline with fictional payloads in separate `.data/ingestion-fixtures.db`. It forces the local mock provider, makes no source or OpenAI network requests, and cannot seed the configured remote database.

## Checks

```sh
npm run lint
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Vitest uses injected time, public API fixtures and isolated real libSQL databases, including migrations, rollback, duplicate identities and retention boundaries. Playwright verifies routes, filters, demo labeling, API authorization, narrow layouts and WCAG A/AA checks. CI runs the same checks with Node 22.

## Local persistence fixtures

`npm run db:seed` migrates and seeds a separate `.data/seed.db` with 221 fictional items, six topics, deterministic topic snapshots and per-source ingestion runs. It deliberately ignores the live database environment setting. Repeating the seed does not duplicate items or topic history. Fixture markers keep seeded evidence out of default live repository queries; the dashboard's default demo already works without a database.

Numbered migrations and validated repository operations live in `src/lib/db`. `npm run db:migrate` defaults to `.data/pulse.db` when no database URL is configured. Items retain 14 days of evidence; topic and dashboard snapshots retain 30 days. Existing JSON storage is upgraded transactionally. See [Persistence](docs/persistence.md) for schemas, migration behavior and query contracts.

## Deployment

Import this repository into Vercel as a Next.js project. A demo deployment needs no secrets. A persistent live deployment needs a **libSQL-compatible Turso database**, `APP_DATA_MODE=live`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and a random `CRON_SECRET` of at least 32 characters in Vercel's encrypted environment settings. Never use a local file database on Vercel.

The included Vercel cron runs daily (02:23 UTC / 07:53 IST), compatible with [Hobby's daily cron limit](https://vercel.com/docs/cron-jobs/usage-and-pricing). For the intended twice-hourly polling, add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as GitHub repository Actions secrets. The scheduled workflow uses the CLI, requires no Vercel URL, and skips visibly when secrets are missing. GitHub schedules can be delayed and public-repository schedules can be [disabled after inactivity](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows). The Vercel daily run is a fallback, not adequate fresh coverage by itself. Both use the same database lease, so overlapping runs are excluded.

`GET /api/ingest` supports Vercel cron and authenticated operators with `Authorization: Bearer <CRON_SECRET>`. Public reads never trigger source calls or writes. The cron secret must not be placed in a URL or a `NEXT_PUBLIC_` variable.

## Semantic enrichment

The default `ENRICHMENT_MODE=mock` uses local deterministic mock responses, needs no key, and incurs no API bills. Collected evidence stays real in live mode; the snapshot explicitly identifies mock topic matching. `off` stores pending signals without classifying them. The legacy `AI_ENABLED` flag cannot enable paid calls.

The production path uses server-only OpenAI Responses with **`gpt-6-luna`**, strict structured output, `store: false` and no tools. It requires an explicit `ENRICHMENT_MODE=openai` configuration. No real OpenAI call is made during development checks. Source titles/excerpts and catalog labels are untrusted JSON input and never become instructions.

The repository saves new signals before enrichment, supplies topic IDs seen within 24 hours, batches at most 10 items, and processes at most 30 per run. Validated settings can lower these limits. Completed items are never processed again. A total 15-second deadline, at most two transient-error attempts per request, a 15-minute per-item cooldown and three-run attempt cap bound cost and outages. Failure keeps the signal pending for a later run. Classification confidence is stored separately; only the deterministic engine computes trend scores and confidence. See [Semantic enrichment](docs/enrichment.md) for result schemas, category mapping, security, provenance and fallback behavior.

## API

| Route | Behavior |
| --- | --- |
| `GET /api/pulse` | Complete ranked snapshot, evidence, hotspots and source health |
| `GET /api/topics` | Filter using `q`, `category`, `source`, `lifecycle`, `limit` (1–100) |
| `GET /api/topics/[slug]` | Active topic detail; 404 for absent/inactive topics |
| `GET /api/hotspots` | Explicit neighborhood mentions, with location caveat |
| `GET /api/health` | Operational state, source status, freshness and mode |
| `GET /api/ingest` | Protected ingestion; 401 without bearer auth; 409 if busy or in demo mode |

Responses have `Cache-Control: no-store`. Unavailable live reads return 503 and expose `generatedAt: null` when there is no readable collection. Stale health returns 503; stale data reads expose available evidence with explicit freshness metadata. Counts are sampled distinct observations, not readership, unique people or citywide activity.

The current pulse contract is `version: "v2"`. Lifecycle filters accept `NEW`, `EMERGING`, `RISING`, `HOT`, `STABLE` and `COOLING`. Topic metrics include `current2h`, `previous2h`, `count6h`, `count24h`, `sourceCount`, `growthRatio`, `latestSignalAgeHours`, `firstSeenAt`, separate `confidence` and bounded `growthPercent`/`changeCapped`. Original count aliases now describe the two-hour comparison. Historical database rows retain their original scoring version and score.

## Architecture and stack

[Architecture](docs/architecture.md) · [Data sources](docs/data-sources.md) · [Trend formula](docs/trend-algorithm.md) · [Engineering rules](AGENTS.md)

Next.js App Router / strict TypeScript / Tailwind CSS / shadcn/ui Button and Badge primitives / Lucide / Recharts / React Leaflet / Zod / Turso-libSQL / Vitest / Playwright / GitHub Actions / Vercel. Local component sources and `components.json` support further shadcn/ui additions. No Reddit integration.
