# Stored-data audit — 15 October 2026

Audited actual Turso data, not demo fixtures. The final [repair and ingestion run](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38748538727) completed successfully and published a deliberately degraded live snapshot at **19:38 IST** (`2026-10-15T14:08:18.491Z`). The audit inspected every retained live row: **173 items and 137 topic records**, including retired topics preserved for history. No sampling limit was reached.

## Findings and repairs

| Check | Observed result and action |
| --- | --- |
| Duplicate URLs | None remained among the 173 stored items. The final repeated poll discovered 100 raw records, rejected one, identified 99 duplicates and inserted zero items. Repeated polling did not create activity. |
| Syndicated near-copies | No remaining pair met the conservative near-copy rule. Added matching before collection/persistence and again before scoring. Independent event paraphrases remain distinct evidence. |
| Duplicate topic labels | Two different software vacancies had identical truncated labels. They refer to job IDs 66895 and 66940 and must stay separate. Repaired 30 existing singleton vacancy labels to retain job IDs; role/seniority and ID now guard matching. |
| Events needing consolidation | Three English Scimplify funding reports were split or marked irrelevant. All now share `repair-scimplify-funding-25-million-9708ff9208677e03`. Both Quantum-Hub@MAHE launch posts now share `5105e972-523c-4d27-8b1a-bc0fbc9a5e3e`; one was previously irrelevant. |
| Incorrect merges | No confirmed incorrect historical event merge was found. The suggested Business Transformation Manager/Senior Manager pair was a false candidate: different roles stay separate. Regression cases also separate routes, places, dates, causes and funding amounts. |
| Invalid/future timestamps | None in stored items/topics. Preserve actual source publication/discovery and collection timestamps; future advertised event dates and dates in URL paths are not publication timestamps. One invalid/out-of-window source record was rejected; the run counter does not identify its specific validation field. |
| Stale items | 156 retained items were outside the current two-hour window; 51 were outside 24 hours. None exceeded 14-day retention. Retention supports history; those older items do not count as current activity. The final collection snapshot was fresh when audited. |
| Bengaluru relevance | Recovered two terminal irrelevant English event paraphrases using distinctive named-event evidence from supplied local topics. A Spanish Scimplify post remains irrelevant because the current heuristic cannot establish the same event from its supplied text safely. Multilingual matching remains a limitation. |
| Neighborhoods | No unsupported or ambiguous persisted named assignment was found. URLs cannot establish places, multiple areas cannot become one guessed hotspot, and MG Road alone cannot establish Bengaluru. |
| Categories | Six confirmed errors were repaired: four food/menu items and two music events had become Mobility/Technology because of road addresses or an organizer named Developers. A hotel's corporate brand announcement retained its business classification; the heuristic's default `other` is not evidence that it was wrong. |
| Pulse Scores | No mismatch against deterministic recomputation. Maximum stored diagnostic score was 20, and no topic qualified for ranking. The score equations and source/evidence caps were preserved. |
| One-source noise | All collected evidence came through Bluesky. Sixteen current singleton topics were flagged for review, including recruitment, promotional posts and weather roundups. They were not promoted into ranking; this data does not establish broad city momentum. |
| Source links | All stored source-link shapes passed validation. Of 24 sampled URLs, 15 returned HTTP 200 and nine returned redirects. Bluesky HEAD requests falsely returned 404; GET returned 200. Redirect destinations were not certified, and an HTTP 200 is not a factual endorsement. |
| Empty summaries | None found in topic or item-enrichment metadata. Whitespace-only summaries and empty attribution spans are rejected. |
| Adapter failures | GDELT exhausted its bounded source budget and recorded five failed queries. Hacker News returned valid empty results. The direct Bluesky AppView collected data; the older cached-host adapter still returned 403 in intervening main-branch scheduled runs. |
| Enrichment backlog | Newest-first claims prevent old backlog from occupying every slot. The final run processed 30 items with genuine heuristic enrichment: 94 relevant completed items, four irrelevant items and 24 pending items remained inside 24 hours. Pending items are visibly excluded from scores. |

## Matching and historical consistency

The replacement is a small deterministic matcher: normalized synonyms, explicit event actions, named entities and conflict guards. It uses no embedding service or model API. Tests exercise differently worded metro disruptions, water interruptions, facility launches and company funding, including reversed headline order. A shared canonical topic does not imply duplicated evidence.

The explicit historical repair changed 34 items: four event assignments and 30 vacancy labels. The six category corrections were applied in an earlier [verified run](https://github.com/icyshimakaze/bengaluru-internet-pulse/actions/runs/38630028073). Repairs use the ingestion lease and atomic writes, validate results before persistence, and preserve original evidence timestamps, actual heuristic provenance and historical snapshots. Retired empty topics retain history and leave the active matching catalog. OpenAI/xKiro/mock records are outside the repair scope.

After repair, the final full audit found no duplicate assigned-topic labels, merge candidates, conflicting assignments, unsupported relevance/neighborhood/category flags, invalid records, empty summaries or score mismatches. These bounded lexical checks are review aids, not a guarantee of semantic correctness. The live snapshot remains degraded because of source coverage and pending enrichment.

## Verification and operational limits

- `npm run lint`, strict TypeScript and `npm run build`: passed.
- `npm test`: **348 tests passed across 24 files**.
- `npm run test:e2e`: **26 production-browser tests passed** against the final build.
- Provider tests use mocked clients; live audit runs selected the free heuristic and made no paid enrichment requests.
- `npm run audit:data -- audit.json` repeats the read-only checks. The category and topic repair CLIs preview by default; `--apply` performs the bounded, leased repair.

Remote data repairs and verification snapshots are applied. Product code changes remain in the local working tree and reviewable isolated audit branches; **main was not changed and the website was not redeployed**. The normal scheduled workflow needs the fixed code published to benefit from the adapter and matcher fixes. Existing unrelated working-tree changes were preserved. GDELT availability, empty HN coverage, multilingual interpretation, incidental city mentions, redirected publisher links and the remaining bounded queue are explicit limitations, not fabricated coverage.
