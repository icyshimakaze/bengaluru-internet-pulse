# Running and deploying

The local demo works without accounts, API keys or a database setup. Node.js 22.13+ is required. Install with `npm ci`, then use `npm run dev`, or `npm run build` and `npm start`. Demo fixtures are fictional and run through the actual deterministic engine.

## Local collected data

Copy `.env.example` to ignored `.env.local`. Set `APP_DATA_MODE=live`, `TURSO_DATABASE_URL=file:.data/pulse.db` and `ENRICHMENT_PROVIDER=heuristic`, then run `npm run db:migrate`, `npm run ingest` and `npm run dev`. Ingestion applies migrations automatically too. A first run can be empty/sparse, and source failures remain visible. Repeat polling builds a baseline without counting duplicates as new activity.

Without an environment file, `npm run ingest` defaults to the local file database and free heuristic. `npm run ingest -- --fixtures` instead forces offline fictional sources/heuristic and writes only `.data/ingestion-fixtures.db`. `npm run db:seed` uses separate `.data/seed.db`; neither seeds the remote production database. Public pages/API reads never collect, migrate or call a model.

## Vercel web application

Import the repository as Next.js. Configure remote `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Production, preferably with a read-scoped token. Never use a local file database on Vercel. `APP_DATA_MODE=live` is optional: a configured database or Vercel flag already defaults to live. An explicit `APP_DATA_MODE=demo` remains a labeled fictional deployment.

Optional `SITE_URL=https://bengaluru-internet-pulse.vercel.app` sets the stable canonical origin. It must be public HTTPS with no credentials, path, query or fragment. Otherwise the stable Vercel production host/project fallback is used; request/preview headers never choose canonicals. Preview/demo/development indexing stays disabled. Icons and social assets are local; topic social images use read-only stored metrics. The sitemap does not trigger storage or ingestion.

Set optional `CONTACT_EMAIL` to the author's actual public contact address to display a footer link. Leave it blank to hide the link. Do not invent an address. Privacy and Terms are draft project descriptions with source comments; the author should review them before release.

Keep provider/source keys and worker limits out of the Vercel web environment. Builds and reads ignore worker AI settings and do not require model credentials. The optional authenticated HTTP collector needs `CRON_SECRET` (at least 32 characters); the normal Actions CLI does not need it or a site URL. Never prefix secrets with `NEXT_PUBLIC_`.

## GitHub Actions worker

Add database URL/token as Actions Secrets with write access. Set repository Variable **`ENRICHMENT_PROVIDER=heuristic`** unless a working API key/model is intentionally configured. The absent-Variable default is heuristic. xKiro/OpenAI remain optional; [provider settings and validation](enrichment.md) preserve their separate credentials/models and heuristic-only fallback. Missing/invalid unused-provider settings cannot break web builds.

Run **Actions → Ingest public signals → Run workflow** for first collection/migration. UTC cron is `17,47 * * * *`; external scheduling may be delayed. Configuration-only dispatch checks presence/limits without collection; an unconfigured schedule skips explicitly. Actual database failures fail visibly. There is no Vercel cron requirement. [Full worker ordering, bounded concurrency, failure semantics and commands](scheduled-ingestion.md).

Deploy the updated web reader before the first new worker publication of expanded source/category/locality values. New readers tolerate old databases and never migrate them. The worker then applies additive migrations 0009/0010 before collection; preserve the existing applied SQL files and checksums.

Optional existing Currents uses `CURRENTS_API_KEY` as an ingestion-only Secret and auto-enables from that key; no new account/key is required by the demo. See [Currents rights and setup](currents.md). Optional `RSS_ENABLED=true` needs no key, but the author must first review [unchecked publisher terms](data-sources.md). Both remain separate from enrichment credentials.

## Configuration reference

| Variable | Purpose / default |
| --- | --- |
| `APP_DATA_MODE` | `demo` locally without storage; `live` with configured storage/Vercel |
| `TURSO_DATABASE_URL` | Local `file:` or remote `libsql://` / `https://` |
| `TURSO_AUTH_TOKEN` | Required for remote storage; server-only |
| `SITE_URL` | Optional public HTTPS canonical origin |
| `CONTACT_EMAIL` | Optional real public contact address; hidden if blank |
| `ENRICHMENT_PROVIDER` | Worker `heuristic` default; optional `xkiro` / `openai`; reject unknown names |
| `ENRICHMENT_ENABLED` | `true`; `false` retains pending collection |
| `AI_BATCH_SIZE` | 1–10; default 10 |
| `MAX_AI_ITEMS_PER_RUN` | 1–30; default 30; separate bounded local recovery |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional OpenAI; existing model default `gpt-6-luna` |
| `XKIRO_API_KEY`, `XKIRO_MODEL` | Optional xKiro; explicit entitled `vendor/model` |
| `XKIRO_BASE_URL` | `https://api.xkiro.com/v1` |
| `SOURCE_TIMEOUT_MS` | Per-attempt default 8000; overall per-source budget 35000 |
| `CURRENTS_API_KEY`, `CURRENTS_ENABLED` | Optional worker news input; activation `auto` / explicit override |
| `RSS_ENABLED` | `false` until feed rights review; config-driven feeds |
| `CRON_SECRET` | Optional HTTP ingestion bearer secret; >=32 characters |

Evidence retention is 14 days; snapshots/completed runs 30 days, pruned by ingestion. The checksummed migration ledger is authoritative; remote Turso omits unsupported file-header `PRAGMA user_version` writes. All SQL/migration compatibility details remain in [persistence](persistence.md).

## Verify a release

Run lint, typecheck, unit tests, build and Playwright. Browser tests cover accessibility, responsive layouts, races, secret exclusion, maps and deferred assets. Tests mock model clients and spend no credits. `npm run screenshot` starts its own demo-only production server and writes actual captures under `docs/images/`. [Recorded checks and external limits](portfolio-readiness.md).

Inspect `/status` and `/api/health` after deployment: database connectivity, source timestamps, enrichment provenance and snapshot freshness are separate. Empty successful collection is healthy; stale/degraded coverage must not become fixtures. The health API retains its legacy aggregate/HTTP semantics, while `/status` separates heuristic fallback from source failure. Reads use atomic batches, a 15-second server cache and uncached HTTP responses; [read API contracts](read-api.md).
