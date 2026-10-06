# Bengaluru Pulse engineering rules

Bengaluru Pulse detects momentum in Bengaluru's public internet. It is not a news feed.

- Keep TypeScript strict. Validate source payloads, environment variables, API inputs, and persisted read models with Zod.
- Keep ingestion and secrets in server-only modules. Public read endpoints must never trigger ingestion.
- AI may classify, match topics, and explain evidence. Only the deterministic engine may assign scores, rank, confidence, or lifecycle.
- Preserve source timestamps and provenance. Deduplicate before scoring; never count repeated polling as new activity.
- Handle source failures independently with deadlines, bounded retries, and structured logs. Never fabricate live evidence.
- Clearly label fixture/demo data. Live mode must show missing, stale, and degraded data honestly.
- Use parameterized SQL and atomic snapshots. Protect ingestion with a server-side bearer secret.
- Preserve accessible semantics, keyboard navigation, responsive layouts, and restrained editorial styling.
- Update docs when changing contracts or scoring. Run `npm run lint`, `npm test`, and `npm run build` before delivery.
- Do not add Reddit. Do not add accounts, paid services, or deployment requirements to the local demo.

See `docs/architecture.md`, `docs/data-sources.md`, and `docs/trend-algorithm.md`.
