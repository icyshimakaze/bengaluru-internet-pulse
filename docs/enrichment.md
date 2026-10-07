# Semantic enrichment

The default provider is `mock`: deterministic local responses exercise the same validated enrichment contract without an API key, network request, or charge. This is a development substitute, not live AI. Only explicit `ENRICHMENT_MODE=openai` enables the server-only OpenAI Responses API with `gpt-6-luna`. `off` collects signals without enrichment.

## Data flow

Sources are validated and deduplicated, then new items are durably stored as pending before any model call. A leased queue selects at most 30 pending items from the previous 24 hours. Successfully completed and irrelevant items are never selected again. Failures remain pending, with a 15-minute retry cooldown and at most three enrichment runs per item. Items still retain the normal 14-day retention period.

Before enrichment the repository fetches up to 50 canonical topics seen within 24 hours, including topics below the ranking threshold. Batches contain at most 10 items. Accepted proposals are added to the catalog for subsequent batches. Topic identity, item assignments, validated enrichment provenance, deterministic topic metrics and snapshots commit together. Failed publication preserves the previously collected pending items and the previous complete snapshot.

## Trust boundary

Instructions are a static server-owned string. Titles, excerpts and the catalog are serialized into a separate user input as untrusted JSON data. No tools, code execution, source fetching, browser actions or model-directed SQL are available. No secrets, profiles, engagement statistics, or trend scores enter the prompt. Output is strict structured data and is validated again locally before persistence. IDs must match the batch and supplied catalog; exactly one existing ID or new topic proposal is required. Unknown keys, duplicate IDs, missing results, invalid enums, unsupported neighborhoods and summaries over 25 words are rejected. Summaries use supplied topic labels or short extractive source text, rather than invented event explanations.

Categories are `civic`, `traffic`, `technology`, `business`, `culture`, `food`, `events`, `weather`, `sports`, `other`. These are retained in enrichment records; a deterministic mapping preserves the dashboard's five editorial category groups. Neighborhoods use the existing curated ten-area enum plus `Citywide` and `Unknown`; neither sentinel becomes a map hotspot. A named area must occur explicitly in the supplied title or excerpt.

`confidence` is classification confidence only. It is persisted separately and never enters the score formula or replaces deterministic trend confidence. Relevant assignments require classification confidence of at least 0.6; existing-topic matches require at least 0.75. Low-confidence or unavailable results stay pending and do not contribute to scoring.

## Cost and availability

Validated environment limits can lower the batch size (default 10, maximum 10) and per-run count (default 30, maximum 30). Prompt excerpts are bounded to 1,000 characters, titles to 300 characters, catalogs to 50 topics, and output to 4,000 tokens per request. The entire enrichment stage has a 15-second deadline; each request gets at most two attempts for temporary network/408/409/429/5xx failures. SDK retries are disabled to prevent multiplying this budget. Permanent errors, refusals, incomplete responses and malformed outputs do not trigger paid format-repair calls. Responses use `store: false` and no tools. Logs contain only provider, counts and fixed error codes.

Missing credentials in explicit OpenAI mode degrade safely to pending storage. No account actions are required for mock mode. The legacy `AI_ENABLED` variable does not enable paid requests.

See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).
