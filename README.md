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

Copy `.env.example` to `.env.local`, set `APP_DATA_MODE=live`, keep `ENRICHMENT_PROVIDER=heuristic` and `TURSO_DATABASE_URL=file:.data/pulse.db`. No source or enrichment API keys are needed. Run:

```sh
npm run db:migrate
npm run ingest
npm run dev
```

The ingestion command automatically migrates the schema too. Poll regularly to build a baseline; first-run rankings have limited history. Public sources can fail or return no matches. Live mode always reports these conditions and never substitutes demo evidence.

`npm run ingest` also works without an environment file, defaulting to local `.data/pulse.db` and **free heuristic enrichment**. For an offline end-to-end collection check, run `npm run ingest -- --fixtures`; it uses the same three adapters and enrichment/persistence pipeline with fictional payloads in separate `.data/ingestion-fixtures.db`. It forces the genuine local heuristic, makes no source or model API requests, and cannot seed the configured remote database.

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

Import this repository into Vercel as a Next.js project. A demo deployment needs no secrets. A persistent live deployment needs a **libSQL-compatible Turso database**, `APP_DATA_MODE=live`, `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel's encrypted environment settings. Never use a local file database on Vercel. `CRON_SECRET` is needed only if an operator uses the optional authenticated HTTP ingestion endpoint.

Production ingestion runs through [GitHub Actions](.github/workflows/ingest.yml) at `17,47 * * * *` UTC and supports **Actions → Ingest public signals → Run workflow**. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as GitHub repository Actions secrets. Until both exist, scheduled runs clearly report **not configured** and skip ingestion before dependency installation; they never count as fresh collection. Normal manual runs with missing secrets and all actual database errors still fail visibly. Use the optional **check_configuration** dispatch to inspect database-secret presence without collection. The intended production provider is **xKiro**, selected through `ENRICHMENT_PROVIDER=xkiro`, with `XKIRO_API_KEY` as a Secret and `XKIRO_MODEL` as a vendor-prefixed model Variable. OpenAI is retained as an optional provider. Workflow concurrency and the database lease prevent overlap. Structured source counts, selected/actual enrichment providers, fallback counts, backlog and retention appear in logs and the run summary. There is no Vercel cron configuration or scheduling dependency. See [Scheduled ingestion](docs/scheduled-ingestion.md).

`GET /api/ingest` remains available to authenticated operators with `Authorization: Bearer <CRON_SECRET>` (at least 32 characters). The GitHub workflow calls the CLI directly and does not need this secret or a deployed site URL. Public reads never trigger source calls or writes. The secret must not be placed in a URL or a `NEXT_PUBLIC_` variable.

## Semantic enrichment

Three server-only providers implement a common `EnrichmentProvider` interface and normalized Zod result contract. `getEnrichmentProvider()` reads `ENRICHMENT_PROVIDER` and rejects unknown values. Switching providers requires environment changes only:

| Provider | Environment | Behavior |
| --- | --- | --- |
| `heuristic` | `ENRICHMENT_PROVIDER=heuristic` | Local default; genuine text/keyword/entity normalization, conservative topic similarity and factual summaries; no key or API bill |
| `xkiro` | `ENRICHMENT_PROVIDER=xkiro`, `XKIRO_API_KEY`, `XKIRO_MODEL` | Intended production selection; OpenAI-compatible Chat Completions; model must retain its `vendor/model` prefix |
| `openai` | `ENRICHMENT_PROVIDER=openai`, `OPENAI_API_KEY` | Optional official Responses API; `OPENAI_MODEL` defaults to `gpt-6-luna` and is configurable |

`XKIRO_BASE_URL` defaults to `https://api.xkiro.com/v1`. Select an entitled xKiro model through configuration; none is hard-coded. Builds and read endpoints need neither provider's credentials. Only the selected provider validates its key, model and URL: missing OpenAI configuration has no effect on xKiro, and missing xKiro configuration has no effect on OpenAI. GitHub scheduled runs and default manual runs honor the `ENRICHMENT_PROVIDER` repository Variable; an explicit manual provider choice overrides it. Blank optional model/base URL Variables use application defaults. A missing or invalid selected-provider setting, 401/403/429, upstream failure, timeout or malformed output falls back **only to heuristic**, never to the other API provider. Actual processing provenance is persisted per item and per run; selecting xKiro does not claim xKiro succeeded when local fallback handled a batch.

The repository commits collected signals before enrichment, supplies active topic IDs seen within 24 hours, batches up to `AI_BATCH_SIZE=10` and processes up to `MAX_AI_ITEMS_PER_RUN=30`. Limits are validated. Completed/irrelevant items are never re-enriched. A 15-second API-stage deadline, eight-second requests, bounded transient retries, queue cooldown and attempt caps prevent runaway work. `ENRICHMENT_ENABLED=false` stores pending items without classification. If heuristic validation also fails, data stays pending rather than being lost or scored.

Source titles/excerpts are untrusted JSON data, separated from static instructions; no tools or code execution are available. Classification confidence remains separate from deterministic trend confidence. Migration 6 preserves historical mock/OpenAI provenance and adds actual-provider metadata and durable enrichment-run statistics. All model tests use mocks and consume no API credits. See [Semantic enrichment](docs/enrichment.md) for the architecture, environment variables, GitHub Secrets/Variables, fallback and observability contracts.

## API

| Route | Behavior |
| --- | --- |
| `GET /api/pulse` | `window=2h\|6h\|24h`, `category`, `source`; top/rising topics, source stream, snapshot and ingestion metadata |
| `GET /api/topics` | Filter the full set using `window`, `q`, `category`, `source`, `lifecycle`, `limit` (1–100) |
| `GET /api/topics/[slug]` | Retained topic detail, including inactive topics; versioned history, bounded evidence and related signals |
| `GET /api/hotspots` | Window/category/source filters; neighborhood activity, average/top pulse and top topic |
| `GET /api/health` | Application/database status, last ingestion, source statuses and 24-hour collection count |
| `GET /api/ingest` | Protected ingestion; 401 without bearer auth; 409 if busy or in demo mode |

Responses have `Cache-Control: no-store`. Unavailable live reads return 503 and expose `generatedAt: null` when there is no readable collection. Stale health returns 503; stale data reads expose available evidence with explicit freshness metadata. Counts are sampled distinct observations, not readership, unique people or citywide activity.

The current scoring contract is `version: "v2"`; dashboard responses use `topTopics` and `risingTopics` instead of exposing internal raw trends. Lifecycle filters accept `NEW`, `EMERGING`, `RISING`, `HOT`, `STABLE` and `COOLING`. Topic metrics include `current2h`, `previous2h`, `count6h`, `count24h`, `sourceCount`, `growthRatio`, `latestSignalAgeHours`, `firstSeenAt`, separate `confidence` and bounded `growthPercent`/`changeCapped`. Selection windows leave scoring fixed at two hours. Historical database rows retain their original scoring version and score. A 15-second server cache reduces query work; health probes storage directly. Parameters and persisted models are validated, and public DTOs omit secrets and storage internals. See [Read API](docs/read-api.md) for complete contracts, privacy, limits and freshness behavior.

## Architecture and stack

[Architecture](docs/architecture.md) · [Data sources](docs/data-sources.md) · [Trend formula](docs/trend-algorithm.md) · [Engineering rules](AGENTS.md)

Next.js App Router / strict TypeScript / Tailwind CSS / shadcn/ui Button and Badge primitives / Lucide / Recharts / React Leaflet / Zod / Turso-libSQL / Vitest / Playwright / GitHub Actions / Vercel. Local component sources and `components.json` support further shadcn/ui additions. No Reddit integration.
