# Semantic enrichment: OpenAI, xKiro and heuristic

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

The new variables replace `ENRICHMENT_MODE`, `ENRICHMENT_BATCH_SIZE`, `ENRICHMENT_MAX_ITEMS` and `PULSE_ENRICHMENT_MODE`. Old mode/enable flags never implicitly activate a paid provider. Update deployment variables rather than relying on those retired names. All configuration is server-only; never set `NEXT_PUBLIC_OPENAI_API_KEY` or `NEXT_PUBLIC_XKIRO_API_KEY`.

## Durable data flow

Collection validates and deduplicates signals and commits pending items **before** enrichment. The leased queue claims at most `MAX_AI_ITEMS_PER_RUN` (default/maximum 30) from the previous 24 hours. Completed and irrelevant items are never re-enriched. Unprocessed items have a 15-minute retry cooldown and three-run attempt cap, and remain retained for 14 days.

Fetch up to 50 active canonical topics seen in the previous 24 hours before any API call. Process batches of `AI_BATCH_SIZE` (default/maximum 10); accepted topics join the catalog for subsequent batches. Whole-batch validation checks all IDs and proposals before accepting any API result. Topic assignments, provider/model provenance, run statistics, deterministic topic scores and snapshots commit in one short publication transaction. No API request occurs within that transaction. Failed publication preserves committed pending collection and the prior complete snapshot.

## Heuristic behavior and limitations

The heuristic is genuine normalization, not a mock response generator. It normalizes Unicode/case/spacing, removes stop words, extracts meaningful tokens and explicit Bengaluru entities, classifies the ten allowed categories, detects supported neighborhood mentions, and constructs short extractive summaries. A curated synonym map normalizes variations such as `delayed`/`delays`, `BMRCL`/`metro` and `flooding`/`flood`.

Existing-topic matching requires token Jaccard similarity of at least 0.75, compatible category, matching numeric/event anchors and no conflicting named neighborhoods. Ambiguous ties propose a new topic. Equivalent proposals within a batch share one identity. Unrelated metro extensions, closures and delays are not collapsed into a fixed metro theme. One named neighborhood is retained only when explicit; several mentions yield Unknown, and Citywide/Unknown never become hotspots. Heuristics can still split paraphrases or miss context and cannot guarantee event equivalence. Low-confidence or unclassifiable signals remain pending.

## Trust and validation

Static instructions stay separate from user JSON containing untrusted titles, excerpts and catalog labels. Source content never becomes a system/developer message, executable code, SQL or a tool request. Neither provider has tools, source-fetching permissions, browser actions or database access. Keys, profiles, engagement data and trend scores are absent from prompts.

Every provider output passes the same strict Zod schema and contextual validator. Reject unknown keys, scoring fields, unexpected/duplicate/missing signal IDs, unknown topic IDs, inconsistent canonical identity, unsupported category/location, invalid confidence/relevance and summaries longer than 25 words or unsupported by supplied metadata. Invalid API output is rejected as a whole batch; heuristic results are validated independently before persistence. The publication boundary revalidates injected results too.

Categories: civic, traffic, technology, business, culture, food, events, weather, sports, other. Neighborhoods: the curated ten Bengaluru areas, Citywide and Unknown. Classification confidence stays separate from deterministic trend confidence: accepted new topics require 0.6 and existing matches 0.75. Providers never choose Pulse Score, final ranking, lifecycle or trend confidence.

## Fallback and bounded work

```text
OpenAI error → heuristic
xKiro error  → heuristic
```

There is **no automatic OpenAI-to-xKiro or xKiro-to-OpenAI fallback**, even when both keys exist. Missing keys/models, 401, 403, exhausted 429 allowance, 5xx, connection errors, timeouts, refusals, truncated output, malformed JSON and invalid results all use local fallback for the failed batch. Retry transient 408/409/429/5xx or connection failures at most once. Permanent failures and malformed outputs are not retried; no paid formatting-repair call is made. After authentication/access/rate exhaustion or a deadline, remaining batches use heuristic without additional API requests.

SDK retries are disabled. Individual API requests have eight-second deadlines, and the entire API stage has a 15-second deadline. Local fallback continues after that deadline. Titles are bounded to 300 characters, excerpts to 1,000, catalogs to 50 and output to 4,000 tokens. If local validation also fails, the collected items remain pending; they are never deleted or admitted into scoring.

## Provenance and observation

`items.enrichment_provider` and `item_enrichments.provider/model` identify the provider that actually processed each item. `enrichment_runs`, linked to the atomic dashboard snapshot, records selected provider, actual providers, attempted/AI/heuristic/unprocessed item counts, provider errors and fallback count. Errors count failed provider attempts, including one configuration error; fallback count is the number of signals routed to heuristic because their selected API was unavailable. Completed/irrelevant counts in snapshots describe the latest 24 hours; run counts describe only this invocation.

Dashboard/API notices and CLI summaries report actual providers (`mixed` when a run uses more than one; `none` when no items were processed). Selecting xKiro does not imply xKiro success, and selecting OpenAI does not imply the site used OpenAI. Fallback marks the run degraded and names heuristic processing. Migration 6 preserves old mock/OpenAI metadata and immutable migration checksums; historical mock records are never relabeled as heuristic. Run retention cascades with the 30-day snapshot retention.

## GitHub configuration and verification

Required database Secrets: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. For xKiro add Secret `XKIRO_API_KEY` and Variables `ENRICHMENT_PROVIDER=xkiro`, `XKIRO_MODEL=vendor/model`. Optional Variables: `XKIRO_BASE_URL`, `AI_BATCH_SIZE`, `MAX_AI_ITEMS_PER_RUN`, `ENRICHMENT_ENABLED`. OpenAI instead needs Secret `OPENAI_API_KEY`, Variable `ENRICHMENT_PROVIDER=openai` and optionally `OPENAI_MODEL`. Heuristic needs no provider Secrets. API keys are scoped only to the ingestion step.

Scheduled runs and the default manual `repository` selection honor `vars.ENRICHMENT_PROVIDER`. A manual provider choice overrides this Variable for that run; an absent Variable defaults the workflow to xKiro. The ingestion step reads both keys from Secrets and provider/model/base URL settings from Variables. Missing credentials for an unused provider have no effect. CI performs production builds with xKiro and OpenAI selected separately, with all provider keys and optional settings empty; neither build calls a model API.

Tests mock both SDK protocols and consume no API credits. They cover factory choices, key/model errors, all required failure modes, fallback isolation, atomic schemas, prompt injection, heuristic entity/topic distinctions, batching, provenance, migration preservation, retention and idempotence. `npm run ingest -- --fixtures` forces heuristic processing and an isolated fixture database regardless of API configuration.

References: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [xKiro API overview](https://docs.xkiro.com/api/overview/), [xKiro Chat Completions](https://docs.xkiro.com/api/chat-completions/).
