# Data sources

Only public APIs are used. Reddit is deliberately excluded.

| Source | Public endpoint | Signal | Limitations |
| --- | --- | --- | --- |
| GDELT DOC 2.0 | `https://api.gdeltproject.org/api/v2/doc/doc` | Bengaluru-related article discovery | Indexing time differs from publication time; syndication and English coverage bias; discovery counts are not readership. |
| Bluesky public AppView | `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` | Public posts mentioning Bengaluru/Bangalore | Search is sampled and service availability varies; no claim of full firehose coverage or precise user location. |
| Hacker News Algolia | `https://hn.algolia.com/api/v1/search_by_date` | Bengaluru-related stories | Small technical audience; indexed stories are not representative of the city. |

Adapters request a bounded recent window, validate each record, reject invalid/future dates, strip markup and preserve original URLs. Bengaluru relevance is text-based; neighborhood tags describe mentions, not a person's physical location. GDELT's `seendate` is explicitly treated as discovery time.

## Collection contract

Every adapter returns `NormalizedSignal`: `source`, `sourceId`, original-source `url`, `title`, `excerpt`, `publishedAt`, `domain` and `sourceType` (`news`, `social`, `tech`). Internal signals add canonical linked-content URL, stable ID, content fingerprint, collection timestamp and publication/discovery provenance. Domain describes the canonical linked content when present. Source type is derived from the provider and does not require profile data.

- GDELT: five searches—broad `Bengaluru OR Bangalore`, plus mobility (metro/traffic/road/airport), technology (startup/AI/technology/software), culture (food/event/culture) and weather (rain/weather/flooding). Requests use `artlist`, JSON, newest-first order and explicit UTC start/end bounds over 24 hours. Caps: 100 broad results and 50 per targeted search. Requests run serially; the HTTP transport spaces starts, including retries, by at least 5.5 seconds.
- Bluesky: Bengaluru, Bangalore, Namma Metro and ಬೆಂಗಳೂರು on the public AppView, newest-first, with `since`/`until` and 50 posts per search. No authorization header or cookies. Only public post text, creation time and AT post identity are retained. Profiles, avatars, follower/engagement counts and handles are discarded. External and record-with-media links may supply dedupe identity; the evidence URL remains the original post permalink.
- HN: Bengaluru and Bangalore, `search_by_date`, story-only, numeric creation-time bounds and 50 hits per search. Retain only story ID, title, optional story text, creation time and optional linked URL. Evidence links to the original HN discussion even when a story has an external link. Authors, profiles, points and comment counts are discarded.

Each source has a 35-second overall deadline, including retries, request pacing and body reads. Bluesky/HN concurrency is capped at two queries each. HTTP requests have a separate configurable per-attempt timeout (default 8 seconds), two attempts, a 2 MiB decompressed response limit and cancellable exponential backoff. Retry network/timeouts, 408, 429 and 5xx; do not retry permanent client errors or invalid JSON. Respect short `Retry-After` delays; longer delays end the query instead of retrying prematurely.

Each query is isolated: successful results survive failed siblings. Source health is `ok`, `partial` or `error`, with raw fetched/valid/rejected counts, intra-source duplicates, query count and failed-query count. A valid empty envelope is healthy; invalid envelopes fail visibly. Structured logs identify provider, query ID, error code, retry attempt and counters, without raw posts or profiles. The pipeline remains successful as an operation when sources fail, publishing degraded/unavailable coverage and per-source run records.

## Duplicate protection

Deduplicate by source identity, canonical URL and a versioned SHA-256 content fingerprint before ranking. The fingerprint normalizes Unicode, casing, markup, whitespace, punctuation and URL noise in title/content; the canonical domain identifies publisher suffixes that can be removed from headlines. Domain is not salted into the final hash, allowing exact syndicated content to match across publishers. This is conservative exact-content matching, not fuzzy paraphrase detection. Recompute comparable fingerprints for legacy retained items while preserving their stored identities. Database unique constraints provide a final transactional check. Valid counts include duplicate query hits; run duplicates equal valid records minus actual inserted items.

## CLI and fixtures

`npm run ingest` uses the configured Turso URL or defaults to local `.data/pulse.db`, runs migrations and records one run per source. No source accounts or API keys are required. A completely unavailable collection is recorded and causes CLI exit code 1; partial coverage is persisted and reported without failing the whole command.

`npm run ingest -- --fixtures` uses `src/fixtures/public-sources.json` and the fixed fixture clock, forces free local mock enrichment, bypasses all live source/OpenAI requests, and writes only to `.data/ingestion-fixtures.db`. Items, topics, runs and snapshots carry fixture/demo markers and are excluded from default live reads. Repeating the command adds no duplicate signals. Automated tests always inject fixtures or mocked responses, including malformed siblings, HTTP failures, stalled bodies, retries, limits and partial/all-source outages. Semantic matching and pending-data recovery are described in [Semantic enrichment](enrichment.md).

Timeouts, retries for network failures/408/429/5xx, maximum response size and per-source statuses protect ingestion. Invalid records are counted. A valid empty result is distinct from a failed source. URL identity strips tracking parameters and fragments; Bluesky external embeds use their linked content URL for dedupe while retaining the public post permalink as provenance. Normalized text identity removes exact syndicated duplicates across sources. Only retained, deduplicated observations contribute to diversity.

The dashboard links to public source pages rather than republishing complete articles. Counts describe observed distinct items, never audience size. Fixtures are fictional and marked as demo; they are never merged into live data.

## Reference documentation

- [GDELT DOC 2.0](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [Bluesky searchPosts lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json)
- [Bluesky public AppView](https://docs.bsky.app/docs/advanced-guides/api-directory)
- [Hacker News Algolia API](https://hn.algolia.com/api)

Endpoint behavior and coverage may change. Source health is displayed alongside every snapshot.

Each poll records a durable ingestion run per source: discovered raw records, actual inserted distinct items, duplicate valid records, rejected/network errors and terminal status. Valid irrelevant and unclassified items are retained with explicit enrichment state; they cannot contribute to rankings. Failed publications roll back item inserts and snapshots and separately mark started runs failed. Expired unfinished runs are recovered as abandoned when the collector next obtains the lease.
