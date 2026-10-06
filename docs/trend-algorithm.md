# Deterministic trend algorithm — v1

AI never computes or influences the final formula. Topic membership determines the evidence set; every numeric metric is calculated from that set by a pure function with an explicit `now`.

## Windows

Use distinct observations in `[now − 24h, now]`. Current count `c` is `(now − 3h, now]`; baseline `b` is `(now − 6h, now − 3h]`. Future observations are excluded. Exact boundary handling is covered by tests. A topic needs two current observations to rank; single observations remain persisted but do not become trends.

## Components, each bounded to 0–1

- Velocity: `clamp((c − b) / (b + 3) / 3)`. The three-item prior prevents a single mention from producing explosive growth.
- Volume: `min(1, log(1 + c) / log(31))`. Saturation limits popular evergreen topics.
- Diversity: distinct current sources divided by three.
- Recency: `exp(−ageOfNewestHours / 3)`.
- Confidence: `min(1, c / 10) × (0.5 + 0.5 × diversity)`.

`Pulse Score = round(100 × (0.40 × velocity + 0.20 × volume + 0.15 × diversity + 0.10 × recency + 0.15 × confidence))`.

Sort by score descending, then velocity descending, then canonical slug ascending for stable ties. Display growth is `round(100 × (c − b) / max(b, 3))`, always labeled against the previous three hours. Scores measure observed momentum, not importance or truth.

## Lifecycle

- `emerging`: at least two current items and fewer than three baseline items.
- `rising`: positive smoothed growth of at least 25%.
- `cooling`: smoothed growth of at most −20%.
- `steady`: remaining ranked topics.

No current evidence means a topic disappears from the active list, even if it was popular yesterday. Confidence labels: high ≥0.7, medium ≥0.35, low otherwise. Confidence represents corroboration within sampled sources, not factual verification.

## History, hotspots and degraded operation

Relational `topic_snapshots` persist current 2h `(now − 2h, now]`, previous 2h `(now − 4h, now − 2h]`, 6h `(now − 6h, now]` and 24h `[now − 24h, now]` counts. `source_count` is distinct sources in current 2h. Explicit 3h counts and `scoring_source_count` retain the v1 formula's inputs. These extra telemetry windows do not change the established ranking formula. Topics below the two-item threshold have stored lifecycle `inactive` and zero score. History is retained for 30 days, separately from 14-day item retention.

Hourly item counts over 24 hours form the chart; no fabricated score history is generated. Neighborhood hotspots count explicit neighborhood mentions within current ranked-topic observations. Unlocated observations are omitted. Maps show topic mention locations, not verified incident coordinates.

Source outages do not inflate remaining sources' diversity weights. Read metadata carries source failures, the original observation time and a stale flag after 90 minutes. A reduced denominator is never used to manufacture confidence. Fixture tests cover burst-vs-popular ranking, dedupe, boundaries, aging, source diversity, stable ties and failure isolation.
