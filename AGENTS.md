# Bengaluru Pulse engineering rules

Bengaluru Pulse detects momentum in Bengaluru's public internet. It is not a news feed.

- Keep TypeScript strict. Validate source payloads, environment variables, API inputs, and persisted read models with Zod.
- Keep ingestion and secrets in server-only modules. Public read endpoints must never trigger ingestion.
- AI may classify, match topics, and explain evidence. Only the deterministic engine may assign scores, rank, confidence, or lifecycle.
- Semantic enrichment uses the server-only OpenAI, xKiro, and heuristic provider interface. Preserve OpenAI support; choose via ENRICHMENT_PROVIDER and reject unknown names. API failures fall back only to the genuine heuristic, never to another API provider.
- Keep API keys private, preserve xKiro vendor/model IDs, validate every batch before persistence, and record actual per-item provider/model and per-run selected/actual providers and fallback counters. Historical mock provenance must remain marked as mock. Tests use mocked clients and never spend API credits.
- Preserve source timestamps and provenance. Deduplicate before scoring; never count repeated polling as new activity.
- Handle source failures independently with deadlines, bounded retries, and structured logs. Never fabricate live evidence.
- Clearly label fixture/demo data. Live mode must show missing, stale, and degraded data honestly.
- Use parameterized SQL and atomic snapshots. Protect ingestion with a server-side bearer secret.
- Preserve accessible semantics, keyboard navigation, responsive layouts, and restrained editorial styling.
- Update docs when changing contracts or scoring. Run `npm run lint`, `npm test`, and `npm run build` before delivery.
- Do not add Reddit. Do not add accounts, paid services, or deployment requirements to the local demo.

See `docs/architecture.md`, `docs/data-sources.md`, and `docs/trend-algorithm.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
