# Previous README source

Preserved verbatim from the pre-task working tree so the documentation move loses no prior information. This is historical source text, not a current status or measurement claim. Current setup is in [deployment](deployment.md), provider contracts in [enrichment](enrichment.md), and public contracts in [read API](read-api.md). Original asset references and recruiter notes belonged to pre-existing uncommitted work and remain untouched in the workspace.

````markdown
# Bengaluru Pulse

The city's internet, compressed into one pulse.

[Live dashboard](https://bengaluru-internet-pulse.vercel.app) · [Demo GIF](#demo-gif) · [Methodology](https://bengaluru-internet-pulse.vercel.app/about)

Bengaluru trend intelligence from public articles, posts and technical discussions. It detects **momentum rather than popularity**, then exposes the evidence behind each trend.

## Problem

A popular topic is not necessarily a rising topic. A hundred mentions in each two-hour window can tell you less about a change than eight recent mentions after one earlier mention, corroborated across sources.

News feeds organize stories. Engagement charts reward volume. Bengaluru Pulse asks a narrower question: **what is gaining attention across the city, and what supports that conclusion?**

## Product

- **Rising now:** ranked topics, activity windows, category/source filters and search.
- **Topic briefs:** growth, confidence, recorded score history, lifecycle milestones and original evidence.
- **Across the city:** explicit neighborhood mentions, with approximate centers and an optional street map.
- **Honest status:** demo, live, delayed, stale and partial coverage remain visible. Missing live data never becomes fixture data.

## Demo GIF

![Demo: filter a trend, open its brief, inspect score history and follow source evidence](docs/assets/demo.gif)

Recorded locally in **demo mode**. Titles are fictional and do not link to original articles; the scoring engine is real. The hosted app labels its own mode and collection status.

<details>
<summary>Desktop, topic brief and mobile screenshots</summary>

![Desktop homepage with a dominant first trend and ranked secondary topics](docs/assets/homepage.png)

![Topic brief showing score, confidence and the evidence behind its movement](docs/assets/topic-brief.png)

<img src="docs/assets/mobile.png" alt="Mobile homepage with visible navigation, native filters and the leading trend" width="320">

</details>

## Review the implementation

The collectors use three public APIs; this project does not scrape full article pages. Follow the [ingestion pipeline](src/lib/pipeline), [scoring engine](src/lib/trends), and [read API contracts](docs/read-api.md) to inspect the main engineering decisions. The [release review](docs/recruiter-release-review.md) records verified behavior and remaining live-service limitations.

## Architecture

[![Bengaluru Pulse architecture: public sources flow through validated, deduplicated ingestion and a durable pending checkpoint into semantic enrichment and deterministic scoring; atomic Turso snapshots feed a separate Next.js read layer hosted on Vercel](docs/assets/architecture.svg)](docs/assets/architecture.svg)

The diagram shows the production flow; the pending checkpoint and published read models share one Turso/libSQL database. Enrichment is configurable: OpenAI (default model `gpt-6-luna`), xKiro or the local heuristic. API failures fall back only to the heuristic. The Pulse engine alone determines scores, ranking, trend confidence and lifecycle.

Ingestion runs separately from the web application. Next.js reads validated, persisted observations and snapshots; opening a page never triggers collection or a model call. Secrets, database clients and enrichment stay server-only.

Reads use an atomic libSQL batch, a 15-second server cache and request memoization. Topic history is bounded by its parent snapshot's capture time. HTTP read responses remain uncached so old coverage cannot masquerade as fresh collection.

[Architecture](docs/architecture.md) · [Read API](docs/read-api.md) · [Persistence](docs/persistence.md)

## Data pipeline

1. Collect each public source independently, with deadlines and bounded retries.
2. Validate payloads and timestamps with Zod; preserve original links and publication/discovery provenance.
3. Canonicalize URLs and deduplicate source identities, matching content and conservative syndicated copies.
4. Persist pending signals, then normalize topics in validated enrichment batches.
5. Calculate deterministic metrics and atomically publish scores, history, source health and run counters.

Collected evidence survives enrichment or publication failure. Repeated polling does not create new activity. Evidence is retained for 14 days; topic and dashboard snapshots for 30 days.

## Pulse Score

The engine compares the **latest two hours** with the **preceding two hours**. Four normalized inputs produce a raw score:

```text
raw score = round(100 × (0.40 × velocity + 0.25 × volume
                     + 0.20 × source diversity + 0.15 × recency))
```

| Input | Weight | Purpose |
| --- | ---: | --- |
| Velocity | 40% | Logarithmic growth, moderated by evidence volume and missing baselines |
| Volume | 25% | Distinct recent signals, logarithmically capped at 20 |
| Source diversity | 20% | Contributing providers out of a fixed denominator of three |
| Recency | 15% | Exponential decay since the latest signal |

Evidence safeguards cap the final score. One-provider topics cannot exceed 55; sparse one-provider topics cannot exceed 35. A source outage never gives the surviving sources extra weight.

### Deterministic ranking

Topics need two distinct current signals to enter the two-hour ranking. Ties resolve by Pulse Score, velocity, then canonical slug. An injected clock makes the same observations and evaluation time reproducible.

The 6h/24h controls change the activity selection, while scoring stays fixed at two hours. Displayed change uses a three-signal baseline floor and a 300% upper bound; absent baselines are labeled explicitly. Exact counts remain inspectable.

[Full equations, caps and boundary conditions](docs/trend-algorithm.md)

### Topic lifecycle

| State | Meaning |
| --- | --- |
| NEW | Isolated or very recently observed evidence |
| EMERGING | Multiple current signals without a previous-window baseline |
| RISING | Growing activity with sufficient score and corroboration |
| HOT | Strong growth, recent evidence, multiple providers and sufficient confidence |
| STABLE | Activity that does not meet another state's thresholds |
| COOLING | A substantial decline or expired current evidence |

States can recur or regress. They are calculated from fixed thresholds; missing historical milestones are never invented.

### Confidence model

Confidence measures **sampled corroboration and grouping quality**, separately from Pulse Score. It combines evidence amount, provider diversity, provider balance and deterministic lexical cluster consistency. Model-generated confidence is not an input.

Labels are high at 70% or above, medium at 35% or above, and low otherwise. Confidence does not establish factual truth, unique people or editorial independence.

## Source adapters

| Adapter | Evidence | Important constraint |
| --- | --- | --- |
| GDELT DOC 2.0 | Bengaluru-related article discovery | Discovery time can differ from publication; syndication needs deduplication |
| Bluesky AppView | Public posts mentioning Bengaluru, Bangalore and selected local terms | Search is sampled; a place mention does not locate its author |
| Hacker News Algolia | Bengaluru-related stories and technical discussion | A small, selective community, not a citywide audience |

The current adapters use public endpoints without source accounts or keys. Each source has a 35-second collection budget; individual requests default to eight seconds. Successful queries survive failed siblings. Valid empty results and failed requests are reported differently.

[Adapter contracts, coverage and failure handling](docs/data-sources.md)

## AI semantic normalization

Different wording can describe the same topic. A server-only `EnrichmentProvider` interface handles topic matching, categories, explicit neighborhood mentions and short evidence summaries.

`ENRICHMENT_PROVIDER` selects `heuristic`, `xkiro` or `openai`; unknown names are rejected. The local default is a genuine text/keyword heuristic. xKiro retains its configured `vendor/model` ID; OpenAI remains supported through the Responses API.

**AI does not assign scores, rank, trend confidence or lifecycle.** Source text is untrusted input, outputs are validated before persistence, and API failures fall back only to the heuristic—not another API provider. Per-item and per-run provenance records what actually processed the evidence, including fallback counts and historical mock records.

[Provider configuration and validation](docs/enrichment.md)

## Technology stack

| Layer | Tools |
| --- | --- |
| Application | Next.js 16 App Router, React 19, strict TypeScript |
| Interface | Tailwind CSS, Lucide, Recharts, React Leaflet |
| Contracts | Zod for source payloads, configuration, API inputs and persisted read models |
| Storage | Turso/libSQL; local file-backed SQLite for development |
| Verification | Vitest, Playwright, axe accessibility checks |
| Delivery | GitHub Actions for CI/ingestion; Vercel for the web application |

The production performance pass reduced initial homepage JavaScript by **59%** in a local cold-load benchmark. Recharts loads near the plot; Leaflet and its CSS load when the map opens. Accessible data tables remain rendered with the page. These are fixture benchmarks, not field performance claims. [Measurements and reproduction](docs/performance.md).

## Project structure

```text
src/
  app/                 Pages, metadata and read/protected ingestion routes
  components/          Editorial UI and isolated interactive views
  fixtures/            Explicitly fictional demo evidence
  lib/
    domain/            Zod contracts and shared types
    sources/           Public adapters and bounded HTTP transport
    pipeline/          Deduplication, topic matching and ingestion
    enrichment/        Heuristic, xKiro and OpenAI providers
    trends/            Deterministic scoring and presentation helpers
    db/                Migrations, repositories and atomic persistence
    server/            Configuration, cached reads and public projections
scripts/               Collection, migrations, audits and benchmarks
tests/                 Unit/integration tests and production browser checks
docs/                  Design decisions, equations, contracts and audits
```

## Local development

Node.js **22.13+** is required.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). With no configuration, the labeled demo runs without accounts, API keys or a database setup.

For local live collection, copy `.env.example` to `.env.local`. Set `APP_DATA_MODE=live`, `TURSO_DATABASE_URL=file:.data/pulse.db` and `ENRICHMENT_PROVIDER=heuristic`, then run:

```sh
npm run db:migrate
npm run ingest
npm run dev
```

Ingestion also applies migrations. Poll again to build a baseline; a first run can be sparse or empty. To exercise the collection pipeline offline, `npm run ingest -- --fixtures` forces heuristic processing and writes only to `.data/ingestion-fixtures.db`, with no source/model API calls.

## Environment variables

See [.env.example](.env.example). Database settings are shared by the web application and worker; enrichment/source settings belong to explicit ingestion.

| Variable | Purpose / default |
| --- | --- |
| `APP_DATA_MODE` | `demo` or `live`; unconfigured local development defaults to demo, Vercel/configured databases to live |
| `TURSO_DATABASE_URL` | Local `file:` URL or remote `libsql://` / `https://` database |
| `TURSO_AUTH_TOKEN` | Server-only token; required for a remote database |
| `SITE_URL` | Optional public HTTPS canonical-origin override |
| `ENRICHMENT_PROVIDER` | Worker provider; defaults to `heuristic` |
| `ENRICHMENT_ENABLED` | Defaults to `true`; `false` retains pending signals without classification |
| `AI_BATCH_SIZE` | Worker batch size, 1–10; default 10 |
| `MAX_AI_ITEMS_PER_RUN` | Worker processing cap, 1–30; default 30 |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI processing only; configured model defaults to `gpt-6-luna` |
| `XKIRO_API_KEY`, `XKIRO_MODEL` | xKiro processing only; configure an entitled `vendor/model` ID |
| `XKIRO_BASE_URL` | Defaults to `https://api.xkiro.com/v1` |
| `SOURCE_TIMEOUT_MS` | Per-attempt source timeout; default 8000 |
| `CRON_SECRET` | At least 32 characters; only for bearer-authenticated HTTP ingestion, not the CLI |

Keep credentials in server/worker settings. Never prefix them with `NEXT_PUBLIC_`. Builds and public reads do not require model credentials or call AI providers.

## Testing

```sh
npm run lint
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The unit/integration and production browser suites cover scoring boundaries, duplicate identities, migrations, transactional rollback, provider fallback/provenance, failed sources, request races, accessibility, responsive layouts, SEO and deferred asset loading.

Tests use injected clocks, isolated local databases and mocked API clients. They spend no model API credits. CI also builds with each API provider selected and no provider credentials, verifying the web/worker boundary.

## Deployment

1. **Web:** import the repository into Vercel as a Next.js project. Set remote `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Production. `SITE_URL` is optional. Keep worker/model credentials out of the web deployment; do not use a local file database there.
2. **Worker:** add the same database credentials as GitHub Actions Secrets. Set `ENRICHMENT_PROVIDER` as a repository Variable. For an API provider, add its key as a Secret and its model as a Variable; `heuristic` needs neither.
3. **First collection:** run **Actions → Ingest public signals → Run workflow**. The worker migrates and publishes snapshots. Scheduled runs use `17,47 * * * *` UTC; there is no Vercel cron dependency.

`/api/health` separates database connectivity from collection freshness. LIVE requires an actual successful collection within 45 minutes and a fresh readable snapshot; collections older than 90 minutes are stale. Unconfigured schedules skip explicitly, and source outages remain visible.

An optional `GET /api/ingest` entry point requires `Authorization: Bearer <CRON_SECRET>`. The scheduled worker uses the CLI directly. [Deployment and scheduling details](docs/scheduled-ingestion.md).

## Limitations

- Public search is a sample. Indexing delays, language coverage, result caps and outages shape the picture.
- Distinct signals are not unique people, audience reach, sentiment or verified truth. Coordinated activity and paraphrased copies remain difficult to identify.
- Semantic matching can split one topic or merge unrelated discussion. The heuristic is more conservative and less context-aware than a model.
- Neighborhoods describe explicit mentions at approximate centers, not verified incidents or user locations.
- Two-hour windows favor observable short-term changes. Sparse evidence and missing baselines limit what a score can establish.

## Evaluation still needed

- Evaluate topic matching against a manually reviewed Bengaluru sample.
- Improve English/Kannada query coverage within the existing public adapters.
- Calibrate confidence and lifecycle thresholds against retained history.
- Add field performance and source-coverage measurements alongside local regression budgets.

## AI-assisted development

**AI coding agents were the primary implementation tool.** They helped with implementation, debugging, testing and refactoring.

Human/product decisions covered the project concept, architecture, source selection, scoring methodology, UX direction, validation and deployment decisions.

Agent work follows [repository guardrails](AGENTS.md): validate external data, keep secrets server-only, preserve provenance, and keep scoring deterministic. Review focuses on behavior rather than generated code volume: [ingestion tests](tests/ingest.test.ts) verify repeat polling and failure recovery; [provider tests](tests/ai.test.ts) exercise malformed responses and fallback; [browser checks](tests/e2e/product.spec.ts) cover source outages, request races and accessibility. Tests mock model clients and spend no API credits.

## Shipping history

The first recorded implementation spans three calendar days, followed by focused reliability and performance passes. Dates below follow the repository history; they do not represent measured engineering hours.

| Date (2026) | Recorded milestones |
| --- | --- |
| October 7 | Persistence, source ingestion and an offline fixture pipeline |
| October 8 | Deterministic scoring, read APIs, dashboard, topic briefs, map and scheduled ingestion |
| October 9 | Explicit handling for an unconfigured schedule |
| October 13–16 | Provider integration, configuration checks, launch quality and production performance |

````
