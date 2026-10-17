# Currents news integration

## Production setup: add one secret

The adapter, database migration, source reporting, deduplication and attribution are built in. No Currents key is required to build the site or use the local demo. Currents is an additional news index; it does not replace GDELT, Bluesky or Hacker News.

1. Create an account at <https://currentsapi.services/en/register> and copy the raw API key from its dashboard.
2. Open <https://github.com/icyshimakaze/bengaluru-internet-pulse/settings/secrets/actions>.
3. Choose **New repository secret**. Name it **`CURRENTS_API_KEY`** and paste the raw key as its value, without `Bearer`, quotes or surrounding spaces.
4. Save. No Actions Variable or Vercel environment variable is required. Existing scheduled ingestion reads the secret on its next run. For an immediate collection, run **Actions → Ingest public signals → Run workflow**, leaving `check_configuration` unchecked. `heuristic` uses no AI credits; `repository` retains the configured enrichment provider and its existing limits.
5. Inspect the run summary for a `currents` row, then open the website's system status. A successful empty response is healthy. Invalid credentials and upstream outages remain visible while other sources continue.

The worker automatically applies migration 8 before collection. Deploy the new web reader before enabling Currents on a shared production database. Public read requests never collect articles or access this key. Adding or rotating the Actions secret needs no Vercel rebuild. Removing it stops Currents collection on subsequent runs; retained evidence keeps its original dates until normal pruning.

## Local setup

Add `CURRENTS_API_KEY=your_raw_key` to the ignored root `.env.local`, preserving other settings. `CURRENTS_ENABLED` defaults to `auto`; if an earlier setup explicitly set it to `false`, remove that line or change it to `auto`. The optional `false` override is supported for explicit local/HTTP workers. The production workflow explicitly uses `auto`, so only the secret is necessary.

For an isolated live test, use `APP_DATA_MODE=live`, `TURSO_DATABASE_URL=file:.data/currents-test.db`, an empty `TURSO_AUTH_TOKEN`, and `ENRICHMENT_PROVIDER=heuristic`. Then run `npm run db:migrate`, `npm run ingest` and `npm run dev`. Do not use production database credentials for a local experiment. Keep keys out of Git, browser code, URLs, logs and chat messages.

## Request and data contract

- Fixed origin and endpoint: `https://api.currentsapi.services/v2/search`.
- One query per ingestion: `query=Bengaluru OR Bangalore`, `language=en`, `page_size=20`, `page_number=1`, and explicit RFC 3339 start/end bounds over the preceding 24 hours. No automatic pagination or backfill. The 20-result cap and English filter limit coverage; this is a sample, not a complete news archive or push stream.
- The raw key is sent in an `Authorization: Bearer …` header only to the fixed Currents origin. It is passed to the ingestion step after dependency installation; other source requests receive no key. Redirects are rejected.
- Zod validates the envelope and individual records. Preserve original article IDs, publisher URLs and publication timestamps. Both offset ISO timestamps and Currents' documented `YYYY-MM-DD HH:mm:ss +0000` format are validated and converted to UTC. Missing descriptions use the genuine headline, not fabricated text. Authors, images, arbitrary categories and full article bodies are not stored by this adapter.
- Existing limits apply: 8-second default per-attempt timeout, two attempts, 2 MiB response bound, 35-second source deadline, bounded backoff and per-source failure isolation. Permanent 401/403 failures are not retried; long `Retry-After` values end the poll. No keys or raw article content enter structured logs.
- Source identity, canonical URL, content fingerprints and syndicated-copy checks deduplicate Currents against prior polls and other providers. Finding one article through two indexes never adds a second signal or refreshes its age.

At 48 scheduled ingestions per day this requests 48 pages, or at most 96 HTTP attempts with the current retry bound. Manual runs and other applications sharing the key also consume quota. The current free plan advertises 250 requests/day, 20 results/request and daily reset at 00:00 UTC / 05:30 IST. Verify the account's current limits in its dashboard: <https://currentsapi.services/en/product/price>.

## Scoring and persistence

Migration 8 expands provider constraints in `ingestion_runs`, `items` and `source_collections`, and permits four provider labels in snapshot counts. It copies dependent enrichment rows before replacing tables, preserves historical snapshots and provenance, restores indexes/dataset guards, and runs atomically with foreign keys enabled. Applied migrations 1–7 are unchanged.

Scoring v3 retains the existing weights, time windows and safeguards. Its diversity, balance and corroboration thresholds use three fixed channels: news, social and tech. GDELT and Currents share news. `sourceCount` counts contributing providers, while `scoring_source_count` stores channel count. Without Currents the previous scoring inputs retain their v2 values. Outages never shrink the denominator. Historical v1/v2 scores remain labeled and stored unchanged; charts separate versions. The dashboard envelope remains v2, independently of scoring version v3. See [trend algorithm](trend-algorithm.md).

## Usage rights and attribution

Confirm the account/publisher permissions for public derived statistics, classification/summaries and retained metadata before using Currents data in those features. API access alone does not grant every downstream publication or archival right. See the current [pricing usage scope](https://currentsapi.services/en/product/price) and [data licence](https://currentsapi.services/terms). API history depth is not a retention licence.

The interface preserves publisher domains/original links and displays **Powered by Currents News API** with relevant source evidence. Attribution does not replace the required usage permissions.

## Verification

`tests/currents.test.ts` uses mocked transports only: key-only activation, secret/header isolation, date validation, empty/malformed/oversized results, deadlines, repeated/cross-provider duplicates, source failures, fixtures, v7 migration preservation and four-provider/three-channel scoring. No tests spend Currents or AI credits. Run `npm run lint`, `npm test`, `npm run build` and the browser suite before releasing integration changes.
