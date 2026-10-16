# Production scheduled ingestion

`.github/workflows/ingest.yml` runs the existing server-only CLI on GitHub-hosted Ubuntu with Node.js 22. It supports `workflow_dispatch` and the UTC cron expression `17,47 * * * *`. The schedule is also at minutes 17 and 47 in IST. `vercel.json` contains no cron; Vercel serves the read/UI layer, and ingestion does not need a site URL.

The Vercel live web deployment requires only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; live mode defaults from Vercel's platform flag. Keep provider keys, model/provider selection, enrichment limits and source settings in Actions. The web environment parser does not validate those worker settings. The ingestion parser runs only when the worker or optional authenticated HTTP ingestion is explicitly invoked. The workflow applies database migrations before collection, so run it against the shared database to initialize the first deployment.

## Repository configuration

In GitHub **Settings → Secrets and variables → Actions**, configure repository secrets:

| Secret | Requirement |
| --- | --- |
| `TURSO_DATABASE_URL` | Required persistent remote `libsql://` or `https://` database URL; local `file:` storage is rejected |
| `TURSO_AUTH_TOKEN` | Required database token with write access |
| `OPENAI_API_KEY` | Optional; used only with explicit `openai` enrichment |
| `XKIRO_API_KEY` | Required for successful xKiro processing; missing keys use heuristic fallback |

Database secrets are scoped to a dependency-free configuration check and the ingestion step. OpenAI/xKiro keys are passed only to ingestion and used only by the selected provider. Checkout, Node setup and `npm ci` receive none of them. Actions use immutable SHA pins; checkout does not persist GitHub credentials. The workflow requests only `contents: read`, prints no environment dump or command trace, and never interpolates secrets into commands, URLs, outputs or summaries.

Before installing dependencies, `scripts/check-ingestion-config.mjs` checks database-secret presence and validates the nonsecret worker limits: `AI_BATCH_SIZE` must be 1–10 and `MAX_AI_ITEMS_PER_RUN` must be 1–30. An invalid limit fails visibly with its variable name and supported range, without printing values or collecting. An unconfigured **scheduled** run emits a warning, explains the missing secret names in its summary, and skips setup/collection. It never claims ingestion or freshness. This bootstrap does not validate database connectivity or provider account access; the actual worker still applies Zod validation before opening storage or collection.

The intended deployment selects **xKiro** when `ENRICHMENT_PROVIDER` is absent. Both scheduled runs and the default manual `repository` selection honor the Actions Variable `ENRICHMENT_PROVIDER`. Set it to `xkiro` and set `XKIRO_MODEL` to a model your account supports, preserving its `vendor/model` prefix. `XKIRO_BASE_URL` defaults to `https://api.xkiro.com/v1` when its Variable is blank. Optional Variables: `AI_BATCH_SIZE` (default/max 10), `MAX_AI_ITEMS_PER_RUN` (default/max 30), and `ENRICHMENT_ENABLED` (default `true`).

Manual dispatch offers `repository` (default), `xkiro`, `heuristic` or `openai`. Explicit provider choices override the repository Variable for that run. To use OpenAI later, change this Variable to `openai`, add `OPENAI_API_KEY` and optionally set `OPENAI_MODEL` (default `gpt-6-luna`). No xKiro key/model/base URL is required when OpenAI is selected, and no OpenAI key/model is required when xKiro is selected. Builds require neither provider's credentials. To use only local free normalization, select `heuristic`; no provider key is needed. Missing selected-provider credentials, invalid model/URL selection or provider failures use **heuristic only**, never another API provider. No tests or configuration-only dispatches call either API. Set `ENRICHMENT_ENABLED=false` to collect pending signals without enrichment. Unknown provider names fail configuration validation. Retired `PULSE_ENRICHMENT_MODE`/`ENRICHMENT_MODE` variables do not select a provider.

Enable repository Actions if disabled and keep the workflow on the default branch. Run **Actions → Ingest public signals → Run workflow**, choosing `heuristic` for local matching or `xkiro` for the configured deployment. An optional GitHub CLI equivalent is:

```sh
gh workflow run ingest.yml --ref main -f enrichment_provider=heuristic
gh run list --workflow ingest.yml --limit 5
```

To check setup safely before obtaining database credentials, select **check_configuration** or run `gh workflow run ingest.yml --ref main -f check_configuration=true`. This checks secret presence and worker limits, always skips ingestion, and reports missing/invalid setup. It does not contact storage or providers. The default is `false`; a normal manual production dispatch with missing credentials fails visibly.

[GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) run the default branch and can be delayed; inactive public repositories may have schedules disabled. The product derives freshness from committed collection timestamps, never from the requested cron time. Manual dispatch requires the workflow file on the default branch; a run can select a branch. A configuration check or skipped unconfigured schedule never updates the application's freshness.

## Pipeline and durability

1. Validate production configuration, migrate the database and acquire the shared database lease.
2. Collect GDELT, Bluesky and Hacker News independently with source deadlines, bounded transient retries, Zod validation, normalization and URL/content deduplication.
3. Persist newly collected signals as pending before attempting enrichment.
4. Fetch the approximately 24-hour active-topic catalog; enrich with bounded batches, validate results, and assign existing or propose canonical topics.
5. In one short database transaction, revalidate/apply topic assignments, deduplicate persisted evidence, calculate deterministic scores/confidence, persist dashboard/topic snapshots, update lifecycle and source counters, and prune expired data.
6. Emit safe committed source counts, enrichment backlog, retention counts and outcome; release the database lease and close the client.

No upstream/model calls occur within publication. The deterministic engine alone controls ranking, confidence and lifecycle. Items retain approximately 14 days; topic/dashboard snapshots and completed source runs retain 30 days. Exact retention boundaries and referenced topics remain protected.

The migration ledger is authoritative for both local and remote databases. Turso rejects SQL writes to `PRAGMA user_version`; those file-header updates now run only on local SQLite. All migration SQL files/checksums, transaction boundaries and historical data preservation remain unchanged. The CLI distinguishes invalid worker settings with `INVALID_INGESTION_CONFIGURATION` and allowlisted `invalidVariables` names instead of misleadingly reporting a database failure. Secret values and raw provider/database exceptions are still omitted.

The fixed workflow concurrency group spans manual and scheduled runs, with `cancel-in-progress: false`. A running ingestion is not interrupted by a newer trigger. GitHub may replace an older pending run with a newer one; the latest polling job is sufficient because repeated polling is idempotent. The separate two-minute database lease also protects against concurrent local/HTTP collectors. The job has a ten-minute timeout including dependency installation; ingestion itself has a three-minute step timeout. Source collection has a 35-second total budget per provider, runs providers independently, and caps individual request timeouts at the configured eight seconds. Optional model work has a 15-second total deadline, batches up to ten items and processes at most thirty per run.

## Failure and observation contracts

| Condition | Workflow outcome | Durable behavior |
| --- | --- | --- |
| Healthy collection and enrichment | Success, `completed` summary | Snapshot, lifecycle and retention commit together |
| Partial or complete source outage | Success with warning, `degraded` summary; coverage can be `unavailable` | Failed providers are recorded, previous evidence is retained within retention, new data from available providers persists |
| Missing/unavailable/malformed API provider output | Success with warning, explicit heuristic fallback | Valid heuristic assignments persist with actual provenance; if heuristic validation also fails, items remain pending |
| Missing secrets on a schedule | Warning, explicit `not_configured` summary; ingestion steps skipped | No installs, collection, database writes, or freshness updates |
| Explicit configuration-only dispatch | Presence-check summary; ingestion steps skipped | No collection or database connectivity check |
| Missing secrets on a normal manual dispatch | Failure, nonzero setup-check exit | No source requests start; missing secret names are listed |
| Invalid configured remote database / direct production CLI missing config | Failure, nonzero CLI exit | No source requests start; no silent runner-local database |
| Migration, DB read/write, publication or retention failure | Failure, nonzero CLI exit | Failed transaction rolls back; prior snapshots and separately committed pending collection survive |
| Another collector owns the lease | Success with `skipped` summary | No overlapping collection or snapshot write |
| Runner cancellation/timeout | Failure/cancellation | Committed pending signals survive; expiring lease and interrupted-run recovery allow later ingestion |

Logs include source query health and terminal `ingest.source_summary` records with source, status, discovered, inserted, duplicates and errors. `ingest.completed` adds ranked topics, available sources, selected/actual enrichment providers, AI/heuristic item counts, provider errors, fallback counts and actual pruning counts. These enrichment-run counters commit with the snapshot in `enrichment_runs`. A strict allowlisted `cli.ingest`/`cli.ingest.failed` JSON report and a Markdown job summary omit storage IDs, raw exceptions, titles, excerpts, credentials and database URLs. Failure counts are unknown when storage has failed, rather than fabricated zeros. No `continue-on-error` hides database errors. The final failure step adds a generic GitHub error annotation; degraded completed runs receive warning annotations.

## Reproduce locally

Install the locked dependencies and run the isolated offline pipeline without accounts, internet requests or model bills:

```sh
npm ci
npm run ingest -- --fixtures
```

This uses the checked-in GDELT/Bluesky/HN fixtures, a fixed fixture clock, free genuine heuristic enrichment and `.data/ingestion-fixtures.db`. It applies migrations, executes the complete pipeline, reports retention and persists only labeled demo data. It overrides API provider choices and cannot send model requests. Repeating the command does not duplicate signals or re-enrich completed items.

For real public collection into local storage, copy `.env.example` to ignored `.env.local`, keep `ENRICHMENT_PROVIDER=heuristic`, set `APP_DATA_MODE=live` and `TURSO_DATABASE_URL=file:.data/pulse.db`, then run:

```sh
npm run ingest
```

To reproduce the exact production command, configure the remote URL/token in ignored `.env.local` or your shell environment and run:

```sh
npm run ingest -- --require-remote
```

The CLI loads `.env.local`/`.env` without printing values and respects environment overrides. Migrations are automatic; `npm run db:migrate` is also available. `--fixtures` and `--require-remote` cannot be combined. `npm run ingest -- --help` describes the modes. An optional `GITHUB_STEP_SUMMARY` path enables the same Markdown report locally; leaving it unset prints only structured logs. No paid provider is exercised by fixture verification.

## Workflow verification

CI runs actionlint 1.7.12 (including its available shell checks) before the application checks. The workflow contracts additionally have parsed YAML tests for triggers, setup ordering, conditional collection, secret scope, bounded work, concurrency and no Vercel cron. Real bootstrap-process tests distinguish unconfigured schedules, manual production failures, configured runs and configuration-only dispatches, and verify secret redaction. CLI tests verify missing configuration fails before collection, logs redact diagnostics, and a real command writes its failed job summary. Transaction tests cover source/AI failures, publication failure, duplicate polls, lifecycle/history, leases and actual retention counts.

With actionlint installed, validate both workflow syntax and GitHub expressions using `actionlint`. An equivalent container command from the repository root is:

```sh
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12
npm run lint
npm test
npm run build
```
