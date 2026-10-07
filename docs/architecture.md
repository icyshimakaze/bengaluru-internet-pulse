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
  → batched semantic enrichment (mock by default; optional Responses API)
  → canonical topics + validated assignments + per-source ingestion runs
  → deterministic rolling-window engine
  → atomic, versioned snapshots + source health
  → server read service → Next.js APIs → responsive UI
```

The orchestrator polls all sources independently. Invalid items are rejected individually. Upstream outages reduce coverage rather than replacing evidence. Ingestion is an explicit CLI or authenticated scheduled endpoint, never a read-side effect.

Source-specific modules produce the shared `NormalizedSignal` contract (news/social/tech) through a bounded collector and HTTP transport. GDELT performs five broad/targeted searches; Bluesky four public city searches; HN two story searches. Queries use explicit recent windows, per-provider concurrency/pacing and a 35-second total source budget. Successful queries survive failed siblings with partial coverage visible in source health and durable run counters. Public evidence retains post/story permalinks and discards unnecessary profile/engagement data. The offline CLI fixture mode runs this same pipeline against marked data in an isolated local database.

## Boundaries

- `src/lib/domain`: Zod schemas and serializable contracts.
- `src/lib/sources`: public API adapters and bounded HTTP transport.
- `src/lib/pipeline`: normalization, URL/content identity, relevance, canonicalization, ingestion.
- `src/lib/trends`: pure scoring with an injected clock; no AI or network dependency.
- `src/lib/db`: libSQL schema, parameterized repositories, transactional snapshots and ingestion lease.
- `src/lib/server`: validated configuration, logging, server-only read service.
- `src/fixtures`: reproducible, explicitly fictional demo observations.
- `src/app`: App Router pages and read APIs. Leaflet and charts load in client components.

## Storage and concurrency

Local development can use a file-backed libSQL database. Vercel uses Turso's remote libSQL endpoint; its ephemeral filesystem is not persistent storage. Observation identity is unique and repeated polls are idempotent. A database lease excludes overlapping runs. Collection first saves pending items, so model or publication failure cannot lose evidence. A subsequent short transaction assigns canonical topics and publishes enrichment, the complete snapshot and its source run counters. Read traffic sees a complete previous or new snapshot.

Evidence is retained for 14 days; topic history and dashboard snapshots for 30 days. A dashboard snapshot contains the most recent 24 hours, with a three-hour current window and preceding three-hour baseline. Relational topic snapshots also expose exact current/previous 2h, 6h and 24h counts. Persisted snapshots retain their scoring time; the read service marks old live snapshots stale and recomputes display rankings from retained evidence so expired topics cannot appear current. Operational health is separate from trend confidence.

Versioned SQL migrations, a checksum ledger and legacy backfill are in `src/lib/db`. Typed repositories handle items, topics, snapshot history, hotspots, ingestion status and pruning. Publication verifies the lease, deduplicates writes and recomputes the deterministic score from persisted evidence inside one short transaction, committing topic metrics, history, dashboard and source counters together. No upstream or AI calls occur inside that transaction. See [Persistence](persistence.md).

## AI contract

Server-side structured output supplies canonical topic identity, category, neighborhood, Bengaluru relevance, a short factual summary and classification confidence. The default mock provider costs nothing; the explicit OpenAI provider uses Responses with `gpt-6-luna`. Both use the same validation boundary. Source content is untrusted data and never modifies instructions. Failures leave durable pending items rather than fabricated classifications. AI cannot write scores, trend confidence, ranking or lifecycle. See [Semantic enrichment](enrichment.md) for schemas, batching, provenance, deadlines and retry limits.

## Delivery and operations

Next.js, strict TypeScript, Tailwind, shadcn/ui primitives, Lucide, Recharts, React Leaflet, Zod, libSQL, Vitest, GitHub Actions and Vercel. Public routes: `/api/pulse`, `/api/topics`, `/api/topics/[slug]`, `/api/hotspots`, `/api/health`. Operational route: `GET /api/ingest`, protected by `CRON_SECRET` and suitable for Vercel cron; CLI: `npm run ingest`.

Structured logs contain counts, durations, source and error codes, never API keys or raw posts. CI runs lint, tests, type checks and production build without live secrets or upstream dependencies.
