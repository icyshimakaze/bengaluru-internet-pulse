# Architecture

## Product contract

"The city's internet, compressed into one pulse."

The dashboard answers what is accelerating across Bengaluru, using independently attributed public signals. A topic detail view exposes evidence and scoring; `/about` explains sampling and uncertainty. A clearly marked deterministic demonstration works without accounts. Live mode only displays persisted observations and never silently substitutes fixtures.

## Pipeline

```text
GDELT / Bluesky public AppView / Hacker News Algolia
  → deadline + bounded retry → Zod payload validation
  → normalized observations with source, URL, text and publication time
  → URL/content dedupe → durable pending libSQL items
  → batched semantic enrichment (OpenAI / xKiro / heuristic)
  → canonical topics + validated assignments + per-source ingestion runs
  → deterministic rolling-window engine
  → atomic, versioned snapshots + source health
  → server read service → Next.js APIs → responsive UI
```

The orchestrator polls all sources independently. Invalid items are rejected individually. Upstream outages reduce coverage rather than replacing evidence. Ingestion is an explicit CLI or authenticated scheduled endpoint, never a read-side effect.

Source-specific modules produce the shared `NormalizedSignal` contract (news/social/tech) through a bounded collector and HTTP transport. GDELT performs five broad/targeted searches; Bluesky four public city searches; HN two story searches. Queries use explicit recent windows, per-provider concurrency/pacing and a 35-second total source budget. Successful queries survive failed siblings with partial coverage visible in source health and durable run counters. Public evidence retains post/story permalinks and discards unnecessary profile/engagement data. The offline CLI fixture mode runs this same pipeline against marked data in an isolated local database.

## Boundaries

- `src/lib/domain`: Zod schemas, internal scoring contracts and small public read DTOs.
- `src/lib/sources`: public API adapters and bounded HTTP transport.
- `src/lib/pipeline`: normalization, URL/content identity, relevance, canonicalization, ingestion.
- `src/lib/trends`: pure scoring with an injected clock; no AI or network dependency.
- `src/lib/db`: libSQL schema, parameterized repositories, transactional snapshots, ingestion lease and a dedicated read-only repository.
- `src/lib/server`: validated configuration, logging, cached server query functions and public model projections.
- `src/fixtures`: reproducible, explicitly fictional demo observations.
- `src/app`: App Router pages and read APIs. Leaflet and charts load in client components.

Web configuration (`src/lib/server/env.ts`) validates only database settings and data mode. The Vercel platform flag or a configured database defaults data mode to live; unconfigured local development defaults to explicitly labeled demo. An explicit `APP_DATA_MODE=demo` remains a demo override. Only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` must be configured for the Vercel live web deployment. Database clients, parameterized queries and credentials remain server-only, and no credential uses `NEXT_PUBLIC_`. Invalid or missing worker AI settings cannot break web reads or startup.

Worker configuration (`src/lib/server/ingestion-env.ts`) contains provider names/keys/models, enrichment limits, source timeouts and optional HTTP ingestion authentication. It is parsed only inside explicitly invoked ingestion/enrichment. Ingestion validates worker settings before database migrations, writes or source collection. GitHub Actions collects all three sources, enriches via the selected provider, calculates deterministic Pulse Scores and publishes Turso snapshots. Vercel has no scheduled enrichment; the production build performs no external AI requests or database reads.

Site metadata has a separate server-only configuration contract: optional `SITE_URL` is validated as a public HTTPS origin and overrides the automatic stable Vercel production host. It has no effect on worker configuration. SEO includes page-specific title/description/canonical/share tags, static icons, crawl rules and a storage-independent sitemap of stable pages. Preview, demo and development pages are excluded from indexing. The root layout explicitly selects the Node.js runtime required by server database modules; Leaflet remains isolated behind the SSR-disabled client boundary.

## Storage and concurrency

Local development can use a file-backed libSQL database. Vercel uses Turso's remote libSQL endpoint; its ephemeral filesystem is not persistent storage. Observation identity is unique and repeated polls are idempotent. A database lease excludes overlapping runs. Collection first saves pending items, so model or publication failure cannot lose evidence. A subsequent short transaction assigns canonical topics and publishes enrichment, the complete snapshot and its source run counters. Read traffic sees a complete previous or new snapshot.

Evidence is retained for 14 days; topic history and dashboard snapshots for 30 days. A v2 dashboard snapshot contains the most recent 24 hours, with a two-hour current window and preceding two-hour baseline. The deterministic engine globally deduplicates evidence before computing bounded velocity, volume, diversity and recency with weights 40/25/20/15. Separate confidence uses evidence, provider diversity/balance and lexical cluster consistency; neither AI confidence nor source availability changes the weights. Exact 2h/6h/24h counts, growth ratio, evidence caps and six-state lifecycle accompany each score. See [Trend algorithm](trend-algorithm.md) for equations and thresholds.

Publication also snapshots retained topics with one or zero current signals, so declines remain visible in history. Migration 5 preserves v1 historical scores and allows both scoring versions at the same capture time. Reads can reevaluate an old v1 dashboard cache using v2 without rewriting history or collection timestamps. The read service marks old live snapshots stale and recomputes display rankings so expired topics cannot appear current. Operational health is separate from trend confidence.

Versioned SQL migrations, a checksum ledger and legacy backfill are in `src/lib/db`. Typed repositories handle items, topics, snapshot history, hotspots, ingestion status and pruning. Publication verifies the lease, deduplicates writes and recomputes the deterministic score from persisted evidence inside one short transaction, committing topic metrics, history, dashboard and source counters together. No upstream or AI calls occur inside that transaction. See [Persistence](persistence.md).

`schema_migrations` supplies the authoritative schema version on all backends. Local SQLite additionally records `PRAGMA user_version`; remote clients omit that header write because Turso rejects it. Migration file checksums and atomic application are preserved.

Public reads use one consistent libSQL read batch, a 15-second server cache and strict DTO projections. Window/category/source filters select evidence and topics; they keep the fixed two-hour scoring equation. Topic detail includes retained inactive topics, bounded versioned history, evidence and related signals. Hotspots expose activity and mean/top pulse. Health bypasses caching and reads database connectivity, latest source runs and 24-hour collection counts. HTTP responses never include credentials, fingerprints, source IDs or raw database/model errors. Missing/stale storage and delayed cache refresh remain visible. See [Read API](read-api.md).

Remote database transport explicitly bypasses Next.js fetch caching and aborts requests after eight seconds while preserving SDK authentication and caller cancellation. Persistent read-cache keys include a SHA-256 database-URL identity, never a URL or token, preventing reuse across databases after a deployment. A source outage does not hide a retained readable topic brief; it retains collection status, notices and original evidence. Canonical/share metadata uses the stable production host rather than preview hosts or request headers, with a static local share image and no external rendering service.

## AI contract

`EnrichmentProvider` is the server-only batch interface. `getEnrichmentProvider()` selects `OpenAIEnrichmentProvider`, `XKiroEnrichmentProvider`, or `HeuristicEnrichmentProvider` using the validated `ENRICHMENT_PROVIDER` enum. OpenAI remains supported through the official Responses API; xKiro uses the official OpenAI client against its compatible Chat Completions endpoint and preserves the configured vendor-prefixed model ID. Local development defaults to heuristic processing without accounts. The intended production configuration selects xKiro through environment variables.

Provider configuration is independent: builds and reads do not require API keys, and only the selected provider validates its credentials/model/URL at construction. Empty GitHub Variables use application defaults. The ingestion workflow honors the repository provider Variable on schedules and default manual dispatches; an explicit manual choice overrides it. CI builds both API selections with empty provider credentials to protect this boundary.

All providers produce the same Zod-validated semantic results: canonical identity, category, explicit neighborhood, local relevance, extractive summary and classification confidence. Static instructions and untrusted signal/catalog JSON remain separate. The heuristic performs real text normalization, keyword/entity extraction, conservative topic similarity and factual summary extraction. Neither AI nor heuristic classification assigns trend scores, ranking, trend confidence or lifecycle.

Missing provider credentials, authentication/access failures, rate limits, upstream failures, deadlines and invalid responses fall back only to the heuristic for that batch. Providers never fail over to another API service. Batch validation is atomic, and collected items are committed before enrichment. Successfully processed items are excluded from future claims. Per-item actual provider/model provenance and per-run selected/actual providers, counts, errors and fallback counts commit with snapshots. Historic mock records keep their original provenance. See [Semantic enrichment](enrichment.md) for configuration, validation and limits.

## Delivery and operations

Next.js, strict TypeScript, Tailwind, shadcn/ui primitives, Lucide, Recharts, React Leaflet, Zod, libSQL, Vitest, GitHub Actions and Vercel. Public routes: `/api/pulse`, `/api/topics`, `/api/topics/[slug]`, `/api/hotspots`, `/api/health`. Operational route: `GET /api/ingest`, protected by `CRON_SECRET` for authenticated operators; CLI: `npm run ingest`. Production scheduling uses GitHub Actions, not Vercel cron; see [Scheduled ingestion](scheduled-ingestion.md).

Structured logs contain counts, durations, source and error codes, never API keys or raw posts. CI runs lint, tests, type checks and production build without live secrets or upstream dependencies.

Scheduled ingestion checks required secret presence before installing dependencies. Missing setup produces an explicit `not_configured` warning and skips collection without changing freshness. Normal manual production dispatches require credentials and fail when they are missing; invalid configured credentials and database failures always fail the production job. An optional configuration-only dispatch inspects presence without collecting or testing connectivity.

## Homepage product surface

The editorial homepage consumes only validated public DTOs, including persisted semantic categories and explicitly mentioned neighborhoods. Server-backed activity/category/source controls preserve the fixed two-hour momentum equation. Recorded score history, hourly signal activity, geographic mention centers and original-source evidence are independently inspectable. The shared header derives LIVE/DELAYED from successful-ingestion freshness, and demo fixtures never qualify as live. See [Homepage](homepage.md) for interaction, failure, accessibility and fixture-history contracts.

The topic intelligence brief uses the same read boundary with snapshot-based momentum and explicit lifecycle milestones. Evidence-only explanations describe counts without inferring causes. A corroborated location projection distinguishes supported, mixed, insufficient and unknown places; titles and original links supply provenance without article bodies. See [Topic detail](topic-detail.md) for support thresholds, archival version isolation and route recovery states.

The neighborhood street map uses a single SSR-disabled React Leaflet boundary, curated approximate centers and OpenStreetMap attribution. Deduplicated neighborhood activity controls marker size; deterministic top-topic intensity controls emphasis. Citywide/empty evidence has no marker. See [Hotspots](hotspots.md) for keyboard interactions, responsive resize, tile failure recovery and verification.

## Production rendering and performance

Pages, metadata, deterministic scoring and database access remain server-only. Identical dashboard projections are memoized per React request. The 15-second server read cache retains its freshness and database-identity guards; health and HTTP read responses remain uncached. Topic history adds one indexed, snapshot-bounded query to the shared atomic state instead of reloading all observations and assignments. Each response evaluates topic metrics once and reuses indexed maps for identity lookups.

Chart controls, captions and exact-value tables render with the page. A shared client boundary loads Recharts when a fixed-height plot approaches the viewport; the same renderer serves homepage and topic charts. The street map and its Leaflet CSS load only when its disclosure opens. Display labels and geographic constants are independent of Zod; client API validation loads in parallel with the first request and still validates the entire response. Only the narrow chart history projection is serialized as the homepage's initial history. Clock subscriptions are isolated from dashboard, chart, stream and footer renders. Date formatters are reused, and system fonts require no network request. See [Performance audit](performance.md) for measurements and regression coverage.
