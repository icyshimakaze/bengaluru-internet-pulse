# First-deployment production audit

Audited 14 October 2026 against `https://bengaluru-internet-pulse.vercel.app` and the updated local production build. Local fixes require redeployment before the deployed behavior changes.

Production SEO and the real GitHub ingestion failures were checked again on 15 October 2026. The deployed observations below describe the inspected revision; the follow-up results describe the repaired Actions configuration/database and local code.

The subsequent requested production review repeated lint, all 322 unit tests, all 26 browser checks, the guarded production build and empty/failed-storage runtime probes successfully. The browser request-boundary regression now covers both Bluesky API hosts. A fresh deployed health request still returned `mode: demo` and database `not_required`; publishing/redeployment and verification of Vercel's live configuration remain necessary.

## Production hardening and ingestion failure follow-up

The repository's failed scheduled runs used `AI_BATCH_SIZE=20` and `MAX_AI_ITEMS_PER_RUN=40`, beyond the supported 10/30 limits. Both Actions Variables were corrected in GitHub and read back successfully. The configuration-only run [38600653268](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38600653268) passed without source, model or database requests.

A subsequent free-heuristic ingestion run exposed a second initialization failure. A temporary isolated diagnostic branch established that Turso connectivity/token validity were good and the database contained only an empty migration ledger. The migration failure was `SQL_PARSE_ERROR: SQL not allowed statement: PRAGMA user_version = 1`. The code now updates that file-header marker only for local SQLite; remote schema versioning uses the authoritative checksummed ledger. Migration files and historical-data contracts remain unchanged. A real remote migration verification [38613012388](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38613012388) passed.

The normal main-branch workflow subsequently completed successfully in [38615303283](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38615303283), with an explicit free-heuristic override and no AI requests. It published zero observations/topics with honestly degraded coverage: all GDELT queries timed out, all Bluesky queries returned HTTP 403, and Hacker News returned valid empty results. This verifies the job and Turso write path, not successful retrieval/enrichment from every provider. The repository's configured xKiro provider/model was unchanged. The permanent migration and validation improvements still need publishing for future migrations and deployments.

A subsequent credential-free [runner probe 38618462864](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38618462864) confirmed that Bluesky's cached public search host returns 403 while the official direct AppView host returns HTTP 200 with a valid post envelope. The adapter now uses `api.bsky.app`, preserving query bounds, provenance, validation and keyless access. This host fix needs publishing before scheduled collection benefits from it.

SEO now adds explicit validated `SITE_URL` support, robots/crawl policies, a stable-page sitemap, ICO favicon and Apple touch icon. Existing page-specific title, description, canonical, Open Graph and Twitter metadata are preserved. Demo/preview/development indexing is disabled, API responses use `X-Robots-Tag`, and production canonicals reject local/private development origins. The API query helper no longer contains a localhost URL fallback.

## Deployed finding requiring attention

`/api/health` returned HTTP 200 with `mode: demo`, `simulated: true`, database `not_required` and no successful live ingestion. Pulse returned 221 fictional observations and six fixture topics. The deployment is healthy as a labeled demo, but this does **not** verify Turso connectivity, real source collection or successful AI enrichment. The private Vercel configuration and deployed revision were not available to this audit, so the exact reason for demo mode is unverified.

Redeploy the fixed code with the remote database URL/token. Remove an unintended `APP_DATA_MODE=demo` override or explicitly select `APP_DATA_MODE=live`. Ensure Actions uses the same database and run ingestion to apply migrations and publish a live snapshot. Then confirm `/api/health` reports `mode: live`, `simulated: false`, database `ok`, an actual collection timestamp and source-run health. HTTP 503 may correctly report empty, stale or degraded collection even when database connectivity is good.

## Coverage and fixes

| Check | Observation / verification |
| --- | --- |
| Database connectivity | Real Actions connectivity, all six remote migrations and snapshot writes passed. Deployed demo bypasses Turso, so Vercel connectivity remains unverified. Local initialized-empty and failed-connection cases preserve honest models and controlled responses. Remote HTTP requests now abort after eight seconds. |
| Environment validation | Web configuration ignores missing or invalid AI settings. Configured databases now select live even if platform system variables are unavailable; explicit demo remains supported. |
| Health | Deployed 200 is explicitly simulated. Local real SQLite health distinguishes database `ok` from connection `unavailable`; both empty/unavailable collection cases return 503. Health is uncached. |
| Dashboard | Deployed fixtures load and are labeled. Tests verify real stored evidence, filters, stale aging, missing storage and no fixture substitution in live mode. |
| Topic pages | Fixture briefs load. Missing-topic API returns 404 and pages expose an archive state with `noindex`; Next.js streaming can give the page HTTP 200. Retained briefs now survive a complete source outage while preserving its unavailable notice. |
| Source links | Inspected links use HTTP(S), original validated URLs and `noopener noreferrer`. Deployed links are fictional examples; real publisher/post reachability cannot be certified from fixtures. |
| Maps | Leaflet mounts, markers and attribution remain visible, and real OSM tiles loaded during inspection. Tile availability varies; mocked outage/retry tests verify the fallback. |
| Server/client boundaries | Database clients, queries, configuration and enrichment remain server-only. Public reads never invoke collection, AI or writes. |
| Leaflet SSR | Deployed server HTML contains no Leaflet map container. The shared dynamic client boundary disables SSR for the browser-only module. |
| Hydration | No observed hydration errors on inspected home, methodology, topic and missing-topic pages. Browser regression checks cover map mounting and route navigation. |
| Cache/revalidation | Read API responses use `no-store`; server reads revalidate every 15 seconds. Opaque database identities now isolate persistent caches across databases. Delayed cache refresh remains visible. |
| Runtime errors | No browser page errors observed in deployed navigation. SDK failures are redacted, and regression checks cover controlled failures without exposing private diagnostics. |
| Mobile | Settled layouts at 320, 390, 768 and 1440 pixels show no page overflow. Charts resize asynchronously, so measurements wait for layout to settle. |
| Metadata | Deployed titles existed but canonical/share tags were absent. Fixed home, methodology and topic metadata use page-specific descriptions and the production origin. |
| Open Graph | Added page-specific Open Graph/Twitter tags and a local 1200×630 PNG. No remote rendering, AI or database access is needed for the asset. |
| Canonical URLs | Stable production-domain canonicals prefer validated `SITE_URL`, then automatic `VERCEL_PROJECT_PRODUCTION_URL`, with this project's production URL as fallback; request and preview hosts are ignored. Missing/unavailable topics are not indexed. |
| Loading | Route skeletons, filter-loading feedback, recorded-history loading and dynamic-map loading remain accessible. Browser checks exercise delayed/racing reads. |
| Empty states | Empty rankings, filters, neighborhood evidence, source evidence and histories remain explicit. Empty initialized databases do not invent timestamps or fixtures. |
| Error states | Retry controls preserve validated evidence, expose controlled messages and recover. Database/source failures do not leak raw exceptions. |
| Browser secrets | All 15 JavaScript chunks loaded in the deployed audit contained none of `TURSO_AUTH_TOKEN`, `TURSO_DATABASE_URL`, `XKIRO_API_KEY`, `OPENAI_API_KEY` or AI endpoint strings. No direct browser requests to database/AI/source APIs were observed. The browser suite also scans every generated local production JavaScript bundle. |

## Required environment

Vercel requires only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for live data. Prefer a database token scoped to reads. Optional `SITE_URL=https://bengaluru-internet-pulse.vercel.app` explicitly configures the public HTTPS origin used by canonicals, social metadata, robots and sitemap. `APP_DATA_MODE` is an optional explicit override, and `VERCEL_PROJECT_PRODUCTION_URL` is a platform-provided fallback, not another user-required variable. Vercel needs no AI keys, provider/model selection, batch limits or `CRON_SECRET` for this architecture.

GitHub Actions requires Secrets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` with write access. To obtain successful xKiro enrichment, also configure Secret `XKIRO_API_KEY` and Variable `XKIRO_MODEL` with an entitled `vendor/model` ID. The workflow defaults to xKiro; setting Variable `ENRICHMENT_PROVIDER=xkiro` makes the intent explicit. For OpenAI, select `ENRICHMENT_PROVIDER=openai` and supply Secret `OPENAI_API_KEY`; `OPENAI_MODEL` is optional and defaults to `gpt-6-luna`. Neither provider requires the other provider's configuration. Heuristic enrichment requires neither AI key. Missing/invalid selected-provider credentials are recorded as genuine heuristic fallback, not successful AI processing.

Optional worker Variables retain their defaults: `AI_BATCH_SIZE=10`, `MAX_AI_ITEMS_PER_RUN=30`, `ENRICHMENT_ENABLED=true`, and `XKIRO_BASE_URL=https://api.xkiro.com/v1`. The workflow already sets `APP_DATA_MODE=live` and `SOURCE_TIMEOUT_MS=8000`. GDELT, Bluesky and Hacker News require no account keys. Actions calls the CLI and needs no deployed site URL or HTTP ingestion secret.

## Remaining production risks

- The current deployment still serves demo data; these fixes have not been published by this audit.
- Actions' Turso token, schema and writes are verified; Vercel's live configuration and connection to the same database still need verification after redeployment.
- The verified ingestion published zero observations with degraded coverage. The Bluesky host fix needs publishing; GDELT timeouts remain an upstream availability risk. Valid empty Hacker News results are not a source failure.
- Provider account/model entitlement and successful xKiro/OpenAI enrichment remain unverified; this audit used mocked providers or a free-heuristic override and spent no AI credits.
- GitHub scheduling and source/OSM availability can be delayed or degraded. The application preserves provenance, freshness notices and tile fallback rather than claiming full coverage.

See [Validation record](validation.md) for the completed checks and [Scheduled ingestion](scheduled-ingestion.md) for worker setup.
