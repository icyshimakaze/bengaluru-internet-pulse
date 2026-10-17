# Coverage, discovery and free data options

Checked 17 October 2026 against production, a real source probe and the providers' own documentation.

## Why only two topics appeared

The homepage had no two-card limit. Its default NOW view selected 2H, and only two stored topics had at least two distinct signals in that period. Roughly 154 relevant signals across 24H did not imply 154 independently corroborated trends. Hacker News had one older matching story; GDELT timed out. The working Bluesky stream therefore dominated. A model API key cannot supply missing evidence: OpenAI/xKiro classify the records we collect.

The two remaining topics were also closely related cricket reports. The site needs broader local evidence and understandable discovery, rather than a lower score threshold that turns every isolated post into a trend.

## Implemented changes

- Bluesky now searches ten city/neighborhood terms. The two broad queries allow 100 results each, with 50 per narrower query. The existing 35-second source deadline, two-query concurrency, response caps, city relevance and deduplication still apply.
- Hacker News searches both stories and public comments. Comments retain their own creation times and discussion URLs; they never inherit a parent's fresh timestamp or contribute profile/engagement data.
- GDELT uses one broad 250-result city request instead of five overlapping requests. Its bounded retries, pacing and honest failure status remain. A real keyless probe still timed out; this is not a claim that the upstream outage is fixed.
- Recently observed exposes up to eight distinct 24H conversations outside the selected ranking, including early singleton evidence. It shows actual counts, provider names and time, with no invented momentum score. Filters and local search apply.
- Lowercase heuristic keyword labels now display a literal source headline with original wording/casing and bounded length. Canonical topic identities and scores remain unchanged. When NOW widens to older evidence and no topic qualifies in the latest 2H, the main list says Recent activity and the lead says Recently observed.

The read-only probe at 18:09 UTC returned 140 distinct Bluesky posts from 168 raw hits and one HN result. Those are collection counts before relevance classification and cross-source persistence deduplication. They are not a controlled before/after growth percentage. GDELT returned no evidence after a bounded timeout.

## Where to obtain free data

| Option | Account/key | Verified limit or condition | Fit for this product |
| --- | --- | --- | --- |
| [Guardian Open Platform](https://open-platform.theguardian.com/access/) | Register a developer key | Free for non-commercial use; up to 500 calls/day and one/second | A legitimate independent news option for a non-commercial public project. Bengaluru coverage is limited; it cannot guarantee a busy local stream. Commercial/derived business uses need the provider's commercial terms. |
| [Currents](https://currentsapi.services/en/product/price) | Free account and API key | 250 requests/day, up to 20 results/request; no artificial article delay | Broader headline/link discovery. Customer-facing AI summaries and long-term archives are outside default self-service rights; confirm this product's enrichment and retention use before integrating. |
| Local publishers' official RSS | Usually no API key | Each publisher controls access and reuse | Best geographic fit when the publisher permits this use. The Hindu Bengaluru and Citizen Matters Bengaluru feeds returned XML in a live probe. Reachability alone does not establish permission for storing/classifying/republishing their feeds. |
| [Mastodon hashtag timelines](https://docs.joinmastodon.org/methods/timelines/#tag) | Public on enabled instances; app token when public preview is disabled | Instance-specific access and rate limits; max 40 statuses/request | Optional additional public conversation. It is sampled and local volume may be low; it is not a replacement news feed. |

For a Guardian key, open **Get Started → Register developer key**, select the truthful non-commercial use case and keep the key private. For Currents, open **Create Free Account → Get API Key**, then confirm the intended public analysis/retention format with that provider. These are additional evidence services, separate from `OPENAI_API_KEY` and `XKIRO_API_KEY`. No new provider account, key or adapter was silently added to the running project. Integration requires a selected provider, a server-only adapter and explicit provenance/scoring contracts; past GDELT evidence must remain marked GDELT.

Several tempting free tiers do not fit live production:

- [NewsAPI.org](https://newsapi.org/pricing): free Developer use is confined to development/testing, including a prohibition on production/staging.
- [GNews](https://gnews.io/pricing): free is non-commercial, 100 requests/day and a 12-hour delay, which is unsuitable for a latest-2H ranking.
- [YouTube](https://developers.google.com/youtube/data/getting-started): a free key can support a separate video discovery feature, but its [developer policies](https://developers.google.com/youtube/terms/developer-policies#handling-youtube-data-and-content) restrict derived data/metrics. It is not recommended as a drop-in Pulse Score input without the necessary permission. This qualification supersedes the initial suggestion that its free quota alone made it suitable.

## Collection needs a dependable trigger too

Production's GitHub schedule has repeatedly arrived hours apart despite a twice-hourly cron. [GitHub documents](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) that scheduled jobs can be delayed or dropped. An API key cannot repair that trigger gap.

The existing **Actions → Ingest public signals → Run workflow** remains the immediate manual recovery. The heuristic override verifies collection without model credits.

An optional free production trigger is [cron-job.org](https://cron-job.org/en/), which supports custom POST headers/body. It can dispatch the existing GitHub workflow, leaving database/model secrets inside Actions. Configure a repository-scoped fine-grained GitHub token with Actions write access in the scheduler's private Authorization header, then POST to `https://api.github.com/repos/icyshimakaze/bengaluru-internet-pulse/actions/workflows/ingest.yml/dispatches` with `Accept: application/vnd.github+json`, `Content-Type: application/json` and this body:

```json
{"ref":"main","inputs":{"enrichment_provider":"repository","check_configuration":"false"}}
```

Choose every 30 minutes, verify a 204 dispatch and a completed ingestion run, then use one primary schedule to avoid redundant work/API usage. The dispatch response does not prove ingestion succeeded; monitor Actions and real source `lastSuccessAt` afterward. The service is free but also [does not guarantee punctuality](https://cron-job.org/en/faq/). This optional account is not required by the local demo and has not been created or configured automatically.

## Product implication

Trustworthy local coverage gives visitors a reason to return. The score remains an evidence-based momentum detector, while the recent-conversation layer makes quieter periods browsable. A busy-looking layout alone cannot guarantee visitors. The next content priority is permissioned local coverage across civic life, transport, culture and events, followed by regular distribution of useful, source-linked city briefs.

## Validation

Lint and the production build passed. The final revision passed all **412 unit tests and 35 browser tests**, including the two headline regressions and quiet wider-window labeling. Tests cover original timestamps/links for HN comments, updated bounded-source counters, singleton discovery without rank promotion, filter/deduplication isolation, literal multilingual headlines, score/identity invariance and the new section's search behavior. One navigation assertion timed out under the initial parallel local browser run, passed in isolation, and the complete single-worker browser run passed. The final 35-test run used the completed build with no concurrent rebuild. Eight new-section viewport captures from 390 to 1920px had no horizontal overflow, preserved `#f8f7f2` and passed a WCAG A/AA scan. Those local section captures use clearly labeled fictional demo test data, under `artifacts/coverage-ui/`.

## Production observation after the coverage release

[Coverage release `dc90b3f`](https://github.com/icyshimakaze/bengaluru-internet-pulse/commit/dc90b3f) deployed successfully and its [CI passed](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/39057515426). The [manual heuristic collection](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/39057521209) completed with 168 accepted Bluesky query records before deduplication, one HN result and zero pending enrichment. GDELT still timed out. The dashboard exposed eight actual recent conversations beside the two topics that then met the 2H threshold.

A later [scheduled collection](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/39059991092) succeeded with a snapshot captured at 18:52 UTC on 17 October / 00:22 IST on 18 October. At the 00:29 IST read, Bluesky and HN were Live, GDELT remained Error, and pending enrichment was zero. The latest 2H was quiet, so NOW transparently used 6H with four older conversations and eight additional recent conversations. Fresh collection does not imply a currently accelerating topic. The third provider outage remains unresolved; no extra news provider or key has been configured.
