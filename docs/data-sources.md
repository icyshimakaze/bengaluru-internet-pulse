# Data sources

Recruitment rule correction, 19 October 2026: company-name posts that advertise a specific role after “hiring” and include an application, work-arrangement or pay cue (for example apply, WFO or package) are retained as `job_posting`, including posts without hashtags or job-board links. Ordinary reporting on hiring trends does not satisfy the rule. The read layer also rechecks retained evidence, so a previously misclassified advertisement is excluded from lead and diagnostic scores before the next worker persists its filter reason. Jobs remain browseable through the Jobs category. Scoring equations and historical snapshots are unchanged.

## Portfolio readiness update — 18 October 2026

RSS/Atom is an optional fifth provider (`rss`, news channel), enabled with worker `RSS_ENABLED=true` after the author reviews reuse permissions. The demo and default worker need no new account or key. Feed configuration is in `src/lib/sources/feeds.config.ts`. Both entries have **terms status: unchecked**; HTTP reachability and robots permission do not establish reuse rights. Publishers also list restrictions for several AI crawlers; review whether the intended classification/publication use is permitted before activation. The default stays off pending that review.

| Feed | Fetch verification | Terms |
| --- | --- | --- |
| [The Hindu Bengaluru](https://www.thehindu.com/news/cities/bangalore/feeder/default.rss) | HTTP 200, XML/RSS; scoped to Bengaluru | unchecked |
| [Citizen Matters](https://citizenmatters.in/feed/) | HTTP 200, XML/RSS via the old Bengaluru hostname redirect; canonical endpoint configured directly. General feed, so explicit local relevance is required | unchecked |

The Deccan Herald candidate `/rss/bengaluru` redirected to HTML, The News Minute candidate `/states/karnataka/feed` returned 404, and the tested TOI ID `-2128838597` identified **Mumbai**. None is configured. No feed URL is claimed working based only on memory. Probe artifacts are retained locally under `.cache/portfolio/probe-*`.

The adapter sends `BengaluruPulse/0.1` with the public repository URL, reads robots.txt first, honors matching product/wildcard allow/disallow patterns, and respects crawl delays up to ten seconds; longer delays skip the feed. A missing robots.txt (404) permits a poll; other robots failures skip it. Requests remain serial within RSS, at least one second apart per host, with the shared two-attempt backoff, 8-second default request deadline, 2 MiB streamed response bound and 35-second overall source deadline. No redirect is followed at runtime. Feed/robots failures are isolated per feed and from other sources. Only 50 entries/feed are considered; oversized envelopes and malformed XML are rejected. DTD/entities are forbidden. Only title, original link, explicit publication date, publisher name and <=600-character excerpt enter normalized evidence, alongside normal deduplication/provenance fields. Full article bodies, feed authors and profiles are discarded. Missing dates never become poll time. RSS and Atom tests use clearly synthetic XML and mocked transports.

HN remains enabled with an additional strict text filter: a story/comment must explicitly name Bengaluru/Bangalore or an unambiguous local civic/metro entity in supplied text. Search ranking and a city name only in a URL do not establish relevance. Original comment dates/permalinks remain intact.

GDELT diagnosis: the current adapter uses the documented DOC endpoint with a single bounded city query, pacing, retries and independent failure handling. A direct workstation request failed with a network `TypeError`; public health at the time of inspection reported `TIMEOUT` with no recorded successful GDELT collection. The [latest accessible workflow history](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/39067970585) reported a successful ingestion operation, which does not imply every source succeeded. Its log-download API returned HTTP 403 without authentication; `gh` is unavailable locally. Earlier dated audits recorded HTTP 429. These observations do not prove a query/configuration bug or a single permanent upstream cause. No outage fix is claimed. GDELT remains non-blocking with explicit machine error codes, independent source deadlines and no fabricated substitute evidence.

Noise rules (`src/lib/ingestion/filters.config.ts`) mark job-board links/recruitment hashtags, automated-weather patterns, hashtag spam and near-empty content. These are content-rule flags, not author/bot identity claims. Items and original timestamps remain stored; `filter_reason` persists with migration 0010. The worker rechecks up to 10,000 retained rows per run and logs filtered counts by source/reason. Filtered items do not enter enrichment queues or deterministic evidence. Jobs have an explicit Jobs stream category/filter and remain browsable with their exclusion reason. Legacy rows receive the same rule projection on reads and are checkpointed by the next worker. Historical score snapshots are preserved. These rules can have false positives/negatives; the evaluation harness measures them only after human labeling.

The gazetteer contains 140 localities/aliases, with Unicode boundaries and city-context guards. Only nine verified OSM centers are map-eligible; every other entry is explicitly unverified. [Complete verification list](neighborhoods.md).

Public APIs supply evidence. Currents is optional and requires a private worker key; the original sources and local demo remain keyless. Reddit is deliberately excluded. See [Currents setup](currents.md): production needs only the `CURRENTS_API_KEY` Actions secret.

All source metadata is untrusted. The shared URL schema applies to collection, persisted records and public responses: HTTP(S) only, maximum 2,048 characters, no credentials/control characters/backslashes, no IP literals or local hostnames. Article links are not fetched by the application. Source HTTP requests reject redirects and retain bounded response streams/deadlines; provider endpoints are fixed in the adapters. This is lexical link validation, not DNS or destination-content certification.

Near-copy detection uses a sorted-title prefix index partitioned by publication day and numeric facts. It narrows candidate comparisons without changing the final 90% title/excerpt overlap and 24-hour rules. Collection and deterministic scoring share this index; identical or highly similar adversarial inputs can still produce large candidate buckets.

| Source | Public endpoint | Signal | Limitations |
| --- | --- | --- | --- |
| GDELT DOC 2.0 | `https://api.gdeltproject.org/api/v2/doc/doc` | Bengaluru-related article discovery | Indexing time differs from publication time; syndication and English coverage bias; discovery counts are not readership. |
| Currents (optional) | `https://api.currentsapi.services/v2/search` | Bengaluru/Bangalore article metadata with publication time | Requires key and appropriate downstream usage rights; one English 24h query, at most 20 results; shares the news scoring channel with GDELT. |
| Bluesky public AppView | `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts` | Public posts mentioning Bengaluru/Bangalore | Search is sampled and service availability varies; no claim of full firehose coverage or precise user location. |
| Hacker News Algolia | `https://hn.algolia.com/api/v1/search_by_date` | Bengaluru-related stories and public comments | Small technical audience; indexed stories are not representative of the city. |

Adapters request a bounded recent window, validate each record, reject invalid/future dates, strip markup and preserve original URLs. Bengaluru relevance is text-based; neighborhood tags describe mentions, not a person's physical location. GDELT's `seendate` is explicitly treated as discovery time.

## Collection contract

Every adapter returns `NormalizedSignal`: `source`, `sourceId`, original-source `url`, `title`, `excerpt`, `publishedAt`, `domain` and `sourceType` (`news`, `social`, `tech`). Internal signals add canonical linked-content URL, stable ID, content fingerprint, collection timestamp and publication/discovery provenance. Domain describes the canonical linked content when present. Source type is derived from the provider and does not require profile data.

- GDELT: one broad `(Bengaluru OR Bangalore)` search using the documented 250-result cap. The former four category requests were subsets of this query; consolidating them reduces duplicate work and provider load. Requests use `artlist`, JSON, newest-first order and explicit UTC start/end bounds over 24 hours. The HTTP transport still spaces request starts, including retries, by at least 5.5 seconds.
- Currents: automatically enabled by a nonblank `CURRENTS_API_KEY` in ingestion. One `Bengaluru OR Bangalore` v2 search, English, 20 results and an explicit 24h RFC 3339 window. The key is an authorization header scoped to Currents, never a URL parameter. Valid empty results are healthy; credentials and outages fail independently. Article publication offsets are validated and retained, and missing descriptions use the actual headline. No profiles, images or full bodies are collected.
- Bluesky: Bengaluru and Bangalore with up to 100 results each; Namma Metro, ????????, Whitefield, Koramangala, Indiranagar, HSR Layout, Bellandur and Electronic City with up to 50 each. All ten searches use the direct public AppView, newest-first and bounded `since`/`until`. Only public post text, creation time and AT post identity are retained. Profiles, avatars, follower/engagement counts and handles are discarded. External links supply dedupe identity; evidence URLs remain original post permalinks. Neighborhood-only matches still pass city-relevance checks; explicit conflicting cities remain excluded by enrichment.
- HN: Bengaluru and Bangalore, `search_by_date`, `(story,comment)` tags, numeric creation-time bounds and 50 hits per query. Stories retain ID, title, optional text, creation time and optional linked URL. Comments require the explicit `comment` tag, a story title, comment text and a valid comment creation time. They link to their own original HN item and retain their own timestamp, rather than inheriting the parent story's age or linked-article identity. Authors, profiles, points and comment counts are discarded.

Each source has a 35-second overall deadline, including retries, request pacing and body reads. Bluesky/HN concurrency is capped at two queries each. HTTP requests have a separate configurable per-attempt timeout (default 8 seconds), two attempts, a 2 MiB decompressed response limit and cancellable exponential backoff. Retry network/timeouts, 408, 429 and 5xx; do not retry permanent client errors or invalid JSON. Respect short `Retry-After` delays; longer delays end the query instead of retrying prematurely.

Bluesky search uses the official direct AppView host, `api.bsky.app`. A credential-free GitHub runner probe on 15 October 2026 returned HTTP 403 from the cached `public.api.bsky.app` search endpoint and HTTP 200 with a valid post envelope from the direct host. The [official API directory](https://github.com/bluesky-social/bsky-docs/blob/main/docs/advanced-guides/api-directory.mdx) identifies this AppView host; the [search lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json) notes that authentication requirements can differ by implementation. No account, authorization header or cookies are added. Future access failures remain visible as degraded coverage.

Each query is isolated: successful results survive failed siblings. Source health is `ok`, `partial` or `error`, with raw fetched/valid/rejected counts, intra-source duplicates, query count and failed-query count. A valid empty envelope is healthy; invalid envelopes fail visibly. Structured logs identify provider, query ID, error code, retry attempt and counters, without raw posts or profiles. The pipeline remains successful as an operation when sources fail, publishing degraded/unavailable coverage and per-source run records.

## Duplicate protection

Deduplicate by source identity, canonical URL and a versioned SHA-256 content fingerprint before ranking. The fingerprint normalizes Unicode, casing, markup, whitespace, punctuation and URL noise in title/content; the canonical domain identifies publisher suffixes that can be removed from headlines. Domain is not salted into the final hash, allowing exact syndicated content to match across publishers. This is conservative exact-content matching, not fuzzy paraphrase detection. Recompute comparable fingerprints for legacy retained items while preserving their stored identities. Database unique constraints provide a final transactional check. Valid counts include duplicate query hits; run duplicates equal valid records minus actual inserted items.

## CLI and fixtures

`npm run ingest` uses the configured Turso URL or defaults to local `.data/pulse.db`, runs migrations and records one run per source. No source accounts or API keys are required. Partial or complete source outages publish degraded/unavailable coverage without crashing collection; database failures exit nonzero.

`npm run ingest -- --fixtures` uses `src/fixtures/public-sources.json` and the fixed fixture clock, forces free genuine heuristic enrichment, bypasses all live source/OpenAI/xKiro requests, and writes only to `.data/ingestion-fixtures.db`. Items, topics, runs and snapshots carry fixture/demo markers and are excluded from default live reads. Repeating the command adds no duplicate signals. Automated tests always inject fixtures or mocked responses, including malformed siblings, HTTP failures, stalled bodies, retries, limits and partial/all-source outages. Semantic matching and pending-data recovery are described in [Semantic enrichment](enrichment.md).

## Enrichment services are not evidence sources

`ENRICHMENT_PROVIDER` selects `openai`, `xkiro` or `heuristic` after collection. OpenAI remains optional through the official Responses API. The intended deployment selects xKiro's OpenAI-compatible Chat Completions API, with `XKIRO_API_KEY`, `XKIRO_BASE_URL` (default `https://api.xkiro.com/v1`) and a configured vendor-prefixed `XKIRO_MODEL`. The local default is a keyless deterministic heuristic. These services normalize supplied metadata and do not contribute evidence sources or decide ranking.

An unavailable API provider falls back only to heuristic. Source text and catalog labels remain untrusted input; every result passes strict Zod/context validation. Secrets stay in ingestion/server code. Per-item and per-run actual-provider provenance distinguishes xKiro success from heuristic fallback; no OpenAI usage is claimed merely because it is supported. No provider or fallback may invent evidence or discard collected data.

Timeouts, retries for network failures/408/429/5xx, maximum response size and per-source statuses protect ingestion. Invalid records are counted. A valid empty result is distinct from a failed source. URL identity strips tracking parameters and fragments; Bluesky external embeds use their linked content URL for dedupe while retaining the public post permalink as provenance. Supplied linked-article titles/descriptions are retained in excerpts; article bodies are not fetched.

Normalized text identity removes exact syndicated duplicates across sources. Conservative near-copy matching additionally requires linked article content, at least seven substantive title and excerpt tokens, at least 90% token coverage on each side, identical numeric tokens and timestamps within 24 hours. Independent paraphrases and distinct commentary remain separate evidence. This check runs before persistence and again over retained scoring evidence. Only retained, deduplicated observations contribute to diversity.

The dashboard links to public source pages rather than republishing complete articles. Counts describe observed distinct items, never audience size. Fixtures are fictional and marked as demo; they are never merged into live data.

## Reference documentation

- [GDELT DOC 2.0](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [Bluesky searchPosts lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json)
- [Bluesky public AppView](https://docs.bsky.app/docs/advanced-guides/api-directory)
- [Hacker News Algolia API](https://hn.algolia.com/api)
- [xKiro compatible API](https://docs.xkiro.com/api/chat-completions/)

Endpoint behavior and coverage may change. Source health is displayed alongside every snapshot.

Each poll records a durable ingestion run per source: discovered raw records, actual inserted distinct items, duplicate valid records, rejected/network errors and terminal status. Valid irrelevant and unclassified items are retained with explicit enrichment state; they cannot contribute to rankings. Failed publications roll back item inserts and snapshots and separately mark started runs failed. Expired unfinished runs are recovered as abandoned when the collector next obtains the lease.
# Collection health in the city signal edition

Migration 0007 stores per-source collection attempts independently of enrichment and publication. Source health uses last successful collection, never the number of items in the selected window. Empty successful polls remain Live. `lastItemAt` preserves the latest observed source timestamp across repeated/empty polls; it does not advance merely because the worker polled again.

A 401, 403 or 429 opens a circuit for the remaining queries of that source in the current poll. Previously returned evidence survives, failed-query counts remain explicit, and other sources continue. Existing per-host pacing, bounded HTTP retries and the 35-second source deadline are retained. The circuit resets next poll and does not bypass upstream restrictions. A direct GDELT probe during the 17 October audit returned HTTP 429; no replacement evidence was fabricated.
