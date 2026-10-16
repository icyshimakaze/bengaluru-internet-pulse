# Pre-launch engineering audit

Reviewed 16 October 2026. Scope: the local working tree's application, API routes, adapters, enrichment providers, deterministic engine, SQL migrations/repositories, maintenance scripts, frontend, dependencies, workflows and tests. Existing unrelated changes were preserved. This review does not deploy code or change production settings.

## Confirmed issues fixed

| Area | Finding | Implemented correction |
| --- | --- | --- |
| Public URLs | The shared read schema accepted credentials and local/IP destinations even though normalization rejected credentials. | One bounded URL contract now protects ingestion, persisted records and public/browser DTOs. Reject credentials, non-HTTP(S), control characters, backslashes, local names and IP literals, including encoded IPv4/IPv6 forms. |
| Outbound requests | Source, model and database fetches followed redirects. | Reject redirects. Model/database authorization stays on its configured endpoint; xKiro configuration additionally requires a public HTTPS hostname. |
| AI grounding | A valid existing ID could accept an unrelated event; one borrowed word could support an invented new label. | Require substantive evidence overlap, at least 60% normalized word support for new labels, and reject explicit existing-event conflicts. Validate IDs against the actual transmitted catalog. |
| AI limits and costs | Direct provider calls bypassed the orchestrator's batch bounds; 429 responses were immediately retried without honoring a longer Retry-After. | Validate direct inputs before requests, cap batches at ten, bound IDs/domains, and stop paid calls for that run on the first 429. |
| Ingestion lease | Pending claims checked the ingestion start time after source collection. | Production claims check the current clock, so elapsed collection time cannot extend a lease's validity. Injected test clocks remain deterministic. |
| Storage growth | Inactive topics generated identical empty history rows every poll for 30 days. | Capture the final zero-24-hour-evidence transition once; resume on new evidence. Preserve historical rows and normal retention. |
| Duplicate detection | Near-copy matching compared every retained article with every other article. | Index sorted title prefixes by publication day/numeric facts; run the unchanged final matching rule only on candidates. |
| CI | CI actions/container references were mutable and CI had no explicit runtime/concurrency bound. | Pin action SHAs and the actionlint image digest, disable persisted checkout credentials, cap CI at 20 minutes and cancel superseded CI runs. Production ingestion retains its separate non-cancelling lock. |

## Boundaries verified

- No exposed credential was found by pattern scans of the working tree and all 11 locally available Git revisions. No committed `.env`, `.env.local` or private-key file was found in that history. No `NEXT_PUBLIC_` secret configuration or raw HTML/eval sink was found in application code. Production browser-bundle tests exclude database/provider credential names and endpoints. Pattern scans cannot prove that every arbitrary string is non-secret.
- External titles, excerpts, domains and catalog labels remain untrusted JSON in the user message. System instructions are static; providers have no tools or database access. “Ignore previous instructions” remains ordinary data. Strict schemas reject scoring fields, malformed/partial responses, unknown IDs and unsupported summaries. Tests mock all model clients and spend no API credits.
- SQL values are parameterized; dynamic columns/clauses come from internal constants. Database uniqueness, dataset guards, foreign keys, atomic publication, lease checks, terminal enrichment states, three-attempt caps and 15-minute claim cooldowns remain covered by tests. Items retain 14 days; snapshots retain 30 days. Public reads cannot trigger ingestion.
- The engine retains a fixed three-provider denominator, bounded components and display growth, singleton/one-source caps, global deduplication and clock-based expiration. AI cannot assign scores or lifecycle. Existing zero-baseline, dominant-provider, duplicate-bridge, HOT/COOLING and stale-evidence regressions pass; scoring equations were not changed.
- Sources fail independently with body/result limits, bounded retries and deadlines. Production Actions serializes ingestion, scopes secrets away from installation, has ten-minute job/three-minute ingestion limits and reports degraded coverage. Successful or irrelevant enrichment is not purchased again; interrupted claims can retry only within the existing attempt cap.
- React renders hostile metadata as text, including map/chart/evidence content. Browser DTO validation rejects unsafe links while retaining the last valid view. External links use `noopener noreferrer`. Browser checks cover hydration, request races, outage/retry states, keyboard controls and automated accessibility checks.

## Validation

- `npm run lint`: passed.
- `npm test`: 377 passed across 26 files.
- `npm run typecheck`: passed.
- `npm run build`: passed, optimized production build.
- `npm run test:e2e`: 27 passed, including hostile headline/unsafe-link injection.
- `npm audit` and `npm audit --omit=dev`: zero reported vulnerabilities at review time.
- `git diff --check`: passed.
- Duplicate-index regressions compare indexed matches against exhaustive matching across size/overlap/time boundaries and produce zero candidates for 10,000 unrelated articles.

## Remaining limits

This is a local code review, not a certification of a deployed instance. Deploy the fixes and recheck live source coverage before presenting the service as operational. No paid model calls or fresh production ingestion were required for this review.

Lexical grounding reduces hallucinations but cannot establish that source claims are true or guarantee model immunity to semantic manipulation. Conservative matching can reject valid paraphrases. Public-hostname validation does not verify DNS ownership, live link availability or destination content; article URLs are never server-fetched. Dense adversarial near-copy buckets and full retained-data reads still need representative production load measurements. Dependency results reflect the advisory registry at the time of this audit.
