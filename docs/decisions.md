# Decisions already present in the project

This log records existing contracts and their documented reasons. It does not invent the author's motivations.

| Decision | Recorded behavior and reason | Evidence |
| --- | --- | --- |
| Two-hour comparisons | Latest 2H versus preceding 2H measures short-term change; 6H/24H controls select evidence without changing scoring. TODO(author): why exactly two hours rather than another interval? | [Algorithm](trend-algorithm.md), [read API](read-api.md) |
| Bounded velocity/change | Smoothing, evidence support, missing-baseline and one-channel caps limit inflated movement from sparse samples. Exact counts remain inspectable. | [Equations and caps](trend-algorithm.md) |
| Heuristic-only fallback | API failures retain evidence and use a genuine free local normalizer; no automatic second API provider/cost is introduced. Actual provider/model and fallback counts remain recorded. | [Enrichment failure contracts](enrichment.md), [architecture](architecture.md) |
| Actions instead of Vercel cron | Collection/enrichment runs separately from the read-only Vercel application. Scheduling, secrets and bounded CLI work belong to the worker. TODO(author): record the original hosting/scheduler selection rationale beyond this separation. | [Scheduled ingestion](scheduled-ingestion.md) |
| Explicit demo mode | Reproducible fictional evidence exercises the real engine without accounts, keys or a storage setup; it never replaces missing live evidence. | [Architecture product contract](architecture.md), [deployment](deployment.md) |
| Snapshot retention | Items retain 14 days; snapshots and completed runs 30 days. Pruning bounds stored history; repeated empty archived snapshots are suppressed. TODO(author): why these exact retention durations? | [Persistence](persistence.md), [security audit](prelaunch-security-audit.md) |

The repository already used scoring v3 when portfolio work began: multiple news indexes share one channel while historical v1/v2 values remain versioned. This work preserves the existing equation and weights. Optional RSS uses that same channel; rule-filtered evidence is excluded before scoring. Heuristic is now the explicit default in both local and scheduled operation to satisfy the keyless path; API provider support remains intact.
