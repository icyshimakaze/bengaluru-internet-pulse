# Architecture

## Product contract

"The city's internet, compressed into one pulse."

The dashboard answers what is accelerating across Bengaluru, using independently attributed public signals. A topic detail view exposes evidence and scoring; `/about` explains sampling and uncertainty. A clearly marked deterministic demonstration works without accounts. Live mode only displays persisted observations and never silently substitutes fixtures.

## Pipeline

```text
GDELT / Bluesky public AppView / Hacker News Algolia
  → deadline + bounded retry → Zod payload validation
  → normalized observations with source, URL, text and publication time
  → URL/content dedupe → Bengaluru relevance
  → topic canonicalization (local semantic rules; optional structured AI)
  → libSQL items + canonical topics + per-source ingestion runs
  → deterministic rolling-window engine
  → atomic, versioned snapshots + source health
  → server read service → Next.js APIs → responsive UI
```

The orchestrator polls all sources independently. Invalid items are rejected individually. Upstream outages reduce coverage rather than replacing evidence. Ingestion is an explicit CLI or authenticated scheduled endpoint, never a read-side effect.

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

Local development can use a file-backed libSQL database. Vercel uses Turso's remote libSQL endpoint; its ephemeral filesystem is not persistent storage. Observation identity is unique and repeated polls are idempotent. A database lease excludes overlapping runs. One short transaction inserts canonical topics and items and publishes the complete snapshot and its source run counters. Read traffic sees a complete previous or new snapshot.

Evidence is retained for 14 days; topic history and dashboard snapshots for 30 days. A dashboard snapshot contains the most recent 24 hours, with a three-hour current window and preceding three-hour baseline. Relational topic snapshots also expose exact current/previous 2h, 6h and 24h counts. Persisted snapshots retain their scoring time; the read service marks old live snapshots stale and recomputes display rankings from retained evidence so expired topics cannot appear current. Operational health is separate from trend confidence.

Versioned SQL migrations, a checksum ledger and legacy backfill are in `src/lib/db`. Typed repositories handle items, topics, snapshot history, hotspots, ingestion status and pruning. Publication verifies the lease, deduplicates writes and recomputes the deterministic score from persisted evidence inside one short transaction, committing topic metrics, history, dashboard and source counters together. No upstream or AI calls occur inside that transaction. See [Persistence](persistence.md).

## AI contract

Optional server-side structured output may supply a canonical topic, category, neighborhood, Bengaluru relevance, and concise description. Existing topic IDs must be validated against the supplied catalog. All model output is untrusted and validated. The model receives source text as data, has no tools, and cannot write scores or change ranking. Failure falls back to local topic rules. AI is optional so ingestion remains useful without paid credentials.

## Delivery and operations

Next.js, strict TypeScript, Tailwind, shadcn/ui primitives, Lucide, Recharts, React Leaflet, Zod, libSQL, Vitest, GitHub Actions and Vercel. Public routes: `/api/pulse`, `/api/topics`, `/api/topics/[slug]`, `/api/hotspots`, `/api/health`. Operational route: `GET /api/ingest`, protected by `CRON_SECRET` and suitable for Vercel cron; CLI: `npm run ingest`.

Structured logs contain counts, durations, source and error codes, never API keys or raw posts. CI runs lint, tests, type checks and production build without live secrets or upstream dependencies.
