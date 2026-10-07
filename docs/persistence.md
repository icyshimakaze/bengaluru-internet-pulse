# Turso / libSQL persistence

All database code lives in `src/lib/db` and server-side pipeline code. UI components only consume domain read models.

## Schema

- `items`: validated public observations, source identity, original/canonical URLs, title, excerpt, domain, publication/discovery and collection timestamps, content fingerprint, optional topic/category/neighborhood, numeric local relevance and enrichment status. Unique constraints on source identity, canonical URL and fingerprint prevent repeat-poll inflation.
- `topics`: stable internal ID and unique slug, canonical label, category/neighborhood, first/last observed times, lifecycle, latest deterministic score/confidence and summary.
- `topic_snapshots`: topic/time/algorithm-version identity, exact current/previous 2h counts, 6h/24h counts, current provider count, four normalized scoring components, separate confidence, score and lifecycle. V2 records also persist growth ratio, latest-signal age, first-seen time, cluster consistency, confidence components, provider balance, score cap and bounded display change. Original 3h fields remain compatibility telemetry for v1 history.
- `ingestion_runs`: one durable run per source, actual start/finish times, discovered/inserted/duplicate/error counters, completion state and sanitized error message.
- Auxiliary `pulse_snapshots` retain the atomic dashboard read model, `leases` exclude overlapping collectors, and `schema_migrations` records numbered migration checksums.
- Migration 4 adds per-item enrichment attempt counts and timestamps, `item_enrichments` for strict semantic results/provider/model/classification confidence, and `topic_enrichments` for the ten-category semantic taxonomy. Foreign keys cascade semantic metadata during retention. Indexed pending queues and 24-hour catalogs avoid expensive repeated model work.
- Migration 5 adds the six-state `lifecycle_v2` and rebuilds the leaf history table with versioned identity and v2 scoring telemetry. It copies v1 rows without recalculating scores, preserves evidence and semantic tables, and restores indexes and dataset/capture guards. V1 and v2 history can coexist at the same timestamp; repeating the same version upserts only that version.

UTC timestamps use ISO 8601 with milliseconds. Scores are 0–100; relevance, confidence and scoring factors are 0–1. Public lifecycle is NEW, EMERGING, RISING, HOT, STABLE or COOLING. Stored topics also use `inactive` when there are no current signals; diagnostic history still records a public lifecycle and a zero score. Single-signal topics receive capped NEW metrics and history but are excluded from public ranking. Original lowercase lifecycle columns are compatibility fields. Item enrichment states distinguish pending, completed, irrelevant and failed classification.

## Migrations

Numbered SQL files are immutable once applied. The runner checks SHA-256 checksums, applies each migration and its ledger entry atomically, and rejects edited or unknown migration histories. Existing JSON-backed databases are upgraded with a transactional backfill that preserves identities, URLs, timestamps, topic descriptions and dashboard snapshots. Migration failure rolls back the schema and data changes. A repeat migration run does no work.

Migration files are explicitly included in Next.js output tracing for deployed ingestion. Read requests never run migrations; `npm run db:migrate` and ingestion do.

## Repository contracts

Validated TypeScript/Zod records back item insertion and duplicate lookup, bounded recent-item queries, topic creation/update/assignment, active-topic listing, snapshot writes/history, hotspot aggregation, ingestion run status and retention. All values use SQL parameters; filter fragments are internal constants. Duplicate inserts return the existing identity instead of replacing evidence. Assignment validates topic ownership and keeps first/last observation timestamps synchronized.

Collection first stores pending items in a leased transaction. Publication happens in a short write transaction after all upstream/model calls finish. It verifies the lease, validates and applies enrichment, globally deduplicates actual persisted evidence, calculates deterministic metrics, writes topic history and the dashboard snapshot, updates run counters, and commits together. Every retained topic seen within 30 days receives a diagnostic snapshot, including below-threshold and expired topics. Zero snapshots stop after that interval so history can age out. A failed publication preserves collected pending data and the previous complete snapshot. Run counters report actual collected inserts even on publication failure.

`EnrichmentRepository` handles durable collection, the 24-hour topic catalog, bounded pending-item claims with cooldown/attempt caps, and validated enrichment reads. The public snapshot and health endpoint expose provider and pending/completed/irrelevant counts; pending evidence degrades health and never contributes to ranking. The model's classification confidence is separate from `topics.confidence` and snapshot trend confidence. See [Semantic enrichment](enrichment.md).

## Retention and fixtures

Items older than 14 days by publication/discovery time are deleted. Topic history and dashboard snapshots older than 30 days by capture time are deleted. Completed ingestion runs are retained for 30 days; unfinished runs are preserved for recovery. Topics remain while retained items or snapshots reference them. Pruning uses an injected UTC clock and retains exact cutoff-boundary records.

`npm run db:seed` creates fictional fixtures in a separate local database at `.data/seed.db`; it does not use the live database environment setting. Seeded rows and snapshots carry fixture/demo markers and are excluded by default from live queries. Re-running with the same fixture clock is idempotent. No remote database is seeded.
