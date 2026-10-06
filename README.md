# Bengaluru Pulse

**The city's internet, compressed into one pulse.**

A momentum detector for Bengaluru's public internet. GDELT, Bluesky public AppView and Hacker News Algolia feed a validated, deduplicated pipeline. A deterministic engine ranks rising topics; every score links to its evidence and component weights.

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

## Optional AI

Off by default. Enable `AI_ENABLED=true` and supply a server-only `OPENAI_API_KEY` and `OPENAI_MODEL` to use structured topic matching through the [Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Only the first 30 new relevant observations per poll are sent in a bounded request, limited to 1,000 text characters each. No keys or post bodies are logged; response storage is disabled. AI failure falls back to synonym rules and token matching. AI cannot set scores or lifecycle. Model access and usage billing depend on the API account; AI is not required for live collection.

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

## Architecture and stack

[Architecture](docs/architecture.md) · [Data sources](docs/data-sources.md) · [Trend formula](docs/trend-algorithm.md) · [Engineering rules](AGENTS.md)

Next.js App Router / strict TypeScript / Tailwind CSS / shadcn/ui Button and Badge primitives / Lucide / Recharts / React Leaflet / Zod / Turso-libSQL / Vitest / Playwright / GitHub Actions / Vercel. Local component sources and `components.json` support further shadcn/ui additions. No Reddit integration.
