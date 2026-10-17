# Semantic enrichment: OpenAI, xKiro and heuristic

**Current default (18 October 2026): heuristic.** Production should set the GitHub Actions repository Variable `ENRICHMENT_PROVIDER=heuristic` unless a working xKiro key and entitled vendor/model are configured. An absent Variable now also defaults to heuristic. OpenAI and xKiro clients, vendor IDs, strict batch validation and heuristic-only API fallback remain supported. Earlier deployment-selection statements below are historical configuration guidance, superseded by this default.

The semantic taxonomy additionally supports `jobs`; rule-filtered recruitment evidence is retained in the Jobs stream and excluded before scoring/enrichment. Dominant sports/event terms take precedence over incidental rain; T20/T20I/ODI/IPL are Sports. Existing categories retain their names.

Cricket washout clustering uses normalized token sets plus exactly two matching team entities, format, action, explicit date conflicts and women's-match guards. In-batch proposals require source timestamps within 12 hours; the existing active catalog is bounded to 24 hours by storage and has no timestamp field in the unchanged provider interface. Without explicit dates, recurring events within that catalog can still be ambiguous. Batch ordering uses original timestamps/IDs for repeatability, not polling time. Other event guards and the >=0.75 lexical fallback remain. Synthetic paraphrase/conflict tests do not establish real matching accuracy. Locality matching now uses the [140-entry gazetteer](neighborhoods.md); unverified centers stay off maps.

All three server-only adapters implement `EnrichmentProvider.enrich(signals, activeTopics, context)` and return the same `EnrichmentResult[]`. `getEnrichmentProvider()` selects a provider using `ENRICHMENT_PROVIDER`; unknown names cause a clear configuration error. OpenAI support is retained. Switching APIs requires environment changes only.

| Provider | Implementation | Credentials and model |
| --- | --- | --- |
| `openai` | Official OpenAI SDK, Responses API, strict structured output, `store: false` | `OPENAI_API_KEY`; `OPENAI_MODEL` defaults to `gpt-6-luna` |
| `xkiro` | Official OpenAI SDK, compatible Chat Completions, JSON-object mode plus strict local validation | `XKIRO_API_KEY`, `XKIRO_MODEL`; `XKIRO_BASE_URL` defaults to `https://api.xkiro.com/v1` |
| `heuristic` | Local deterministic normalization and conservative topic matching | No key, account, network request or bill |

Local development defaults to `ENRICHMENT_PROVIDER=heuristic`. The intended deployment selects `ENRICHMENT_PROVIDER=xkiro`; the scheduled workflow defaults to this selection. xKiro models **must include the vendor prefix** (`openai/...`, `z-ai/...`, `google/...`), preserved exactly in requests and provenance. No xKiro model is hard-coded: select a model your account can access. API selection does not imply free or entitled model access; this implementation does not make a claim about provider pricing.

## Configuration

```dotenv
# Intended production selection; local .env.example instead defaults to heuristic.
ENRICHMENT_PROVIDER=xkiro
XKIRO_API_KEY=your-private-key
XKIRO_BASE_URL=https://api.xkiro.com/v1
XKIRO_MODEL=vendor/model-from-your-account
AI_BATCH_SIZE=10
MAX_AI_ITEMS_PER_RUN=30
```

Use `ENRICHMENT_PROVIDER=openai` with `OPENAI_API_KEY` and optionally `OPENAI_MODEL` to switch to OpenAI. Use `ENRICHMENT_PROVIDER=heuristic` for keyless operation. Builds and read endpoints require neither API key, regardless of provider selection. Keys, model IDs and provider URLs are checked only when constructing the selected provider: xKiro ignores OpenAI configuration, and OpenAI ignores xKiro configuration. Blank model/base URL variables use application defaults; xKiro still needs its explicit vendor-prefixed model for API processing. A selected provider with missing or invalid configuration logs a sanitized configuration error and falls back to heuristic. `ENRICHMENT_ENABLED=false` deliberately leaves signals pending without consuming enrichment attempts.

These are ingestion worker settings, validated through `src/lib/server/ingestion-env.ts` only when ingestion/enrichment is invoked. Vercel's web parser contains no provider or AI settings and ignores even invalid worker values. Configure provider keys/models, `ENRICHMENT_PROVIDER`, `AI_BATCH_SIZE` and `MAX_AI_ITEMS_PER_RUN` in GitHub Actions, rather than Vercel. The live Vercel application needs only the remote Turso URL/token and performs no scheduled AI work.

The new variables replace `ENRICHMENT_MODE`, `ENRICHMENT_BATCH_SIZE`, `ENRICHMENT_MAX_ITEMS` and `PULSE_ENRICHMENT_MODE`. Old mode/enable flags never implicitly activate a paid provider. Update deployment variables rather than relying on those retired names. All configuration is server-only; never set `NEXT_PUBLIC_OPENAI_API_KEY` or `NEXT_PUBLIC_XKIRO_API_KEY`.

## Durable data flow

Collection validates and deduplicates signals and commits pending items **before** enrichment. The leased queue claims at most `MAX_AI_ITEMS_PER_RUN` (default/maximum 30) from the previous 24 hours. Within each attempt count it processes newest evidence first, so old backlog cannot consume every slot while current events remain unclassified. Completed and irrelevant items are never re-enriched. Unprocessed items have a 15-minute retry cooldown and three-run attempt cap, and remain retained for 14 days.

Fetch up to 50 active canonical topics seen in the previous 24 hours before any API call. Process batches of `AI_BATCH_SIZE` (default/maximum 10); accepted topics join the catalog for subsequent batches. Whole-batch validation checks all IDs and proposals before accepting any API result. Topic assignments, provider/model provenance, run statistics, deterministic topic scores and snapshots commit in one short publication transaction. No API request occurs within that transaction. Failed publication preserves committed pending collection and the prior complete snapshot.

## Heuristic behavior and limitations

The heuristic is genuine normalization, not a mock response generator. It normalizes Unicode/case/spacing, removes stop words, extracts meaningful tokens and explicit Bengaluru entities, classifies the ten allowed categories, detects supported neighborhood mentions, and constructs short extractive summaries. A curated synonym map normalizes variations such as `delayed`/`delays`, `BMRCL`/`metro` and `flooding`/`flood`.

General existing-topic matching requires token Jaccard similarity of at least 0.75 and a compatible category. A small event-anchor matcher also recognizes metro actions with a shared route or neighborhood, water-supply interruptions with a shared neighborhood, distinctive named facility launches and named-company funding. Conflicting explicit dates, routes, causes, neighborhoods and funding amounts prevent these matches. Amounts are compared numerically, so `$25M` and `$25 million` agree. Generic metro stories never receive the stronger match solely for mentioning metro. Anchored proposals preserve event information and prefer amount-bearing evidence within a batch, making tested paraphrases stable when their order changes. A distinctive named event can inherit Bengaluru relevance from supplied local catalog or batch evidence; explicit foreign-city context blocks that inheritance. No model call or embedding index is involved.

Ambiguous ties propose a new topic. Equivalent proposals within a batch share one identity. A number in a shared proposed label must be supported by a separately validated observation or the existing catalog; validation remains atomic. One named neighborhood is retained only when explicit in text; several mentions yield Unknown, and Citywide/Unknown never become hotspots. URLs cannot establish city or neighborhood relevance. Ambiguous MG Road mentions alone are insufficient. Heuristics can still split multilingual paraphrases and cannot establish whether two incidents with incomplete anchors are the same event. Low-confidence or unclassifiable signals remain pending.

Category matching uses the activity text before structured venue/organizer sections. A restaurant menu on Old Airport Road is food, and a music event organized by a company named Developers remains an event. A bare road address is not a traffic incident. Bluesky excerpts retain supplied linked-article titles/descriptions alongside post text, without fetching article bodies or altering timestamps and permalinks.

The read-only `npm run audit:data -- audit.json` command inspects actual live rows, not fixtures, with explicit sampling bounds. For the reproduced historic category leak, `node --conditions=react-server --import tsx scripts/repair-data-categories.ts` previews repairs; `--apply` acquires the ingestion lease and updates item/topic/category metadata atomically. Repairs are limited to singleton topics processed by the genuine heuristic with explicit Food/Music event or Pizza Making text. Mock/API provenance, timestamps, identities and historical snapshots remain unchanged. A subsequent ingestion publishes a new snapshot.

Vacancy topics require both the same explicit role and job ID to match. Labels retain the ID rather than truncating away the distinction between different vacancies. `node --conditions=react-server --import tsx scripts/repair-stored-topics.ts` previews a bounded repair of genuine-heuristic named-event assignments and singleton vacancy labels; `--apply` uses the ingestion lease and a transaction. Supported named-event evidence can recover a terminal irrelevant paraphrase and consolidate split topics. Original source/collection times and historical snapshots remain intact. Empty retired topics retain history but are excluded from the active matching catalog. The auditor compares duplicate/merge candidates only among topics with completed evidence; a default `other` category does not constitute evidence that a prior classification is wrong.

## Trust and validation

Static instructions stay separate from user JSON containing untrusted titles, excerpts and catalog labels. Source content never becomes a system/developer message, executable code, SQL or a tool request. Neither provider has tools, source-fetching permissions, browser actions or database access. Keys, profiles, engagement data and trend scores are absent from prompts.

xKiro returns a strict classification-only batch without a summary field. The server constructs each summary as a bounded contiguous span of the original source title/excerpt, using the same extraction as the genuine heuristic. This prevents a model paraphrase from rejecting an otherwise valid classification and never admits generated assertions. Extra fields, including a generated summary, still reject the gateway batch. OpenAI retains its strict full output contract. After source-summary construction, every provider result passes the same strict Zod schema and contextual validator. Reject unknown keys, scoring fields, unexpected/duplicate/missing signal IDs, unknown topic IDs, inconsistent canonical identity, unsupported category/location, invalid confidence/relevance and summaries longer than 25 words or unsupported by supplied metadata. API topic IDs must belong to the exact catalog sent to that request. Relevant, confident assignments need substantive source-word support; new labels require at least 60% normalized word support, and existing labels cannot contradict explicit event anchors. These checks reduce hallucinations without proving source assertions true. Invalid API output is rejected as a whole batch; heuristic results are validated independently before persistence. The publication boundary revalidates injected results too.

Categories: civic, traffic, technology, business, culture, food, events, weather, sports, other. Neighborhoods: the curated ten Bengaluru areas, Citywide and Unknown. Classification confidence stays separate from deterministic trend confidence: accepted new topics require 0.6 and existing matches 0.75. Providers never choose Pulse Score, final ranking, lifecycle or trend confidence.

## Fallback and bounded work

```text
OpenAI error → heuristic
xKiro error  → heuristic
```

There is **no automatic OpenAI-to-xKiro or xKiro-to-OpenAI fallback**, even when both keys exist. Missing keys/models, 401, 403, 429, 5xx, connection errors, timeouts, refusals, truncated output, malformed JSON and invalid results all use local fallback for the failed batch. Retry transient 408/409/5xx or connection failures at most once. A 429 immediately stops paid requests for the remainder of that run; the worker does not retry earlier than Retry-After. Permanent failures and malformed outputs are not retried; no paid formatting-repair call is made. After authentication/access failure or a deadline, remaining batches use heuristic without additional API requests.

SDK retries are disabled. OpenAI requests have eight-second deadlines and a 15-second stage budget. xKiro requests have 30-second deadlines and a 60-second stage budget so a free gateway response is not aborted at eight seconds. The stage budget bounds all batches and retries together and reserves time for atomic publication within the ingestion lease. Local fallback continues after that deadline. Titles are bounded to 300 characters, excerpts to 1,000, signal IDs to 200, domains to 253, catalogs to 50 and output to 4,000 tokens. Direct provider calls validate inputs and enforce the ten-item batch limit before requesting a model. Authenticated provider transport rejects redirects and disables caching. The configured xKiro endpoint must use a public HTTPS hostname without credentials, query or fragment; vendor/model IDs remain unchanged. If local validation also fails, collected items remain pending; they are never deleted or admitted into scoring.

## Provenance and observation

`items.enrichment_provider` and `item_enrichments.provider/model` identify the provider that actually processed each item. `enrichment_runs`, linked to the atomic dashboard snapshot, records selected provider, actual providers, attempted/AI/heuristic/unprocessed item counts, provider errors and fallback count. Operational logs include the selected model, HTTP status when available and allowlisted validation codes (for example, summary rejection or truncated output), never response bodies or upstream error messages. Errors count failed provider attempts, including one configuration error; fallback count is the number of signals routed to heuristic because their selected API was unavailable. Completed/irrelevant counts in snapshots describe the latest 24 hours; run counts describe only this invocation.

Dashboard/API notices and CLI summaries report actual providers (`mixed` when a run uses more than one; `none` when no items were processed). Selecting xKiro does not imply xKiro success, and selecting OpenAI does not imply the site used OpenAI. Fallback marks the run degraded and names heuristic processing. Migration 6 preserves old mock/OpenAI metadata and immutable migration checksums; historical mock records are never relabeled as heuristic. Run retention cascades with the 30-day snapshot retention.

## GitHub configuration and verification

Required database Secrets: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. For xKiro add Secret `XKIRO_API_KEY` and Variables `ENRICHMENT_PROVIDER=xkiro`, `XKIRO_MODEL=vendor/model`. Optional Variables: `XKIRO_BASE_URL`, `AI_BATCH_SIZE`, `MAX_AI_ITEMS_PER_RUN`, `ENRICHMENT_ENABLED`. OpenAI instead needs Secret `OPENAI_API_KEY`, Variable `ENRICHMENT_PROVIDER=openai` and optionally `OPENAI_MODEL`. Heuristic needs no provider Secrets. API keys are scoped only to the ingestion step.

Scheduled runs and the default manual `repository` selection honor `vars.ENRICHMENT_PROVIDER`. A manual provider choice overrides this Variable for that run; an absent Variable defaults the workflow to xKiro. The ingestion step reads both keys from Secrets and provider/model/base URL settings from Variables. Missing credentials for an unused provider have no effect. CI performs production builds with xKiro and OpenAI selected separately, with all provider keys and optional settings empty; neither build calls a model API.

Tests mock both SDK protocols and consume no API credits. They cover factory choices, key/model errors, all required failure modes, fallback isolation, atomic schemas, prompt injection, heuristic entity/topic distinctions, batching, provenance, migration preservation, retention and idempotence. `npm run ingest -- --fixtures` forces heuristic processing and an isolated fixture database regardless of API configuration.

References: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [xKiro API overview](https://docs.xkiro.com/api/overview/), [xKiro Chat Completions](https://docs.xkiro.com/api/chat-completions/).
# Bounded local pending recovery

The selected provider still receives at most 30 candidates per run. Missing/low-confidence API results fall back to the real heuristic. A separate recovery scan processes at most 500 additional or exhausted pending items locally, without API credits and without respecting the paid-attempt ceiling. It uses the same validated signal and evidence contracts. Low-confidence/corrupted items may remain unresolved, are logged and stay outside scores; valid siblings are isolated if a heuristic batch fails.

Recovery carries new topic identities into its catalog and resolves equivalent proposals to existing durable IDs. Actual item providers/model IDs and selected/actual run providers remain recorded. `attempted`, `heuristicEnriched`, `unprocessed` and `fallbackCount` can cover up to 530 items; `aiEnriched` remains bounded to 30. A run notice distinguishes an API failure from heuristic recovery outside the API budget/confidence threshold. None of these conditions changes source collection health.
