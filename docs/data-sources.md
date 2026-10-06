# Data sources

Only public APIs are used. Reddit is deliberately excluded.

| Source | Public endpoint | Signal | Limitations |
| --- | --- | --- | --- |
| GDELT DOC 2.0 | `https://api.gdeltproject.org/api/v2/doc/doc` | Bengaluru-related article discovery | Indexing time differs from publication time; syndication and English coverage bias; discovery counts are not readership. |
| Bluesky public AppView | `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` | Public posts mentioning Bengaluru/Bangalore | Search is sampled and service availability varies; no claim of full firehose coverage or precise user location. |
| Hacker News Algolia | `https://hn.algolia.com/api/v1/search_by_date` | Bengaluru-related stories | Small technical audience; indexed stories are not representative of the city. |

Adapters request a bounded recent window, validate each record, reject invalid/future dates, strip markup and preserve original URLs. Bengaluru relevance is text-based; neighborhood tags describe mentions, not a person's physical location. GDELT's `seendate` is explicitly treated as discovery time.

Timeouts, retries for network failures/408/429/5xx, maximum response size and per-source statuses protect ingestion. Invalid records are counted. A valid empty result is distinct from a failed source. URL identity strips tracking parameters and fragments; Bluesky external embeds use their linked content URL for dedupe while retaining the public post permalink as provenance. Normalized text identity removes exact syndicated duplicates across sources. Only retained, deduplicated observations contribute to diversity.

The dashboard links to public source pages rather than republishing complete articles. Counts describe observed distinct items, never audience size. Fixtures are fictional and marked as demo; they are never merged into live data.

## Reference documentation

- [GDELT DOC 2.0](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [Bluesky searchPosts](https://docs.bsky.app/docs/api/app-bsky-feed-search-posts)
- [Bluesky public AppView](https://docs.bsky.app/docs/advanced-guides/api-directory)
- [Hacker News Algolia API](https://hn.algolia.com/api)

Endpoint behavior and coverage may change. Source health is displayed alongside every snapshot.

Each poll records a durable ingestion run per source: discovered raw records, actual inserted distinct items, duplicate valid records, rejected/network errors and terminal status. Valid irrelevant and unclassified items are retained with explicit enrichment state; they cannot contribute to rankings. Failed publications roll back item inserts and snapshots and separately mark started runs failed. Expired unfinished runs are recovered as abandoned when the collector next obtains the lease.
