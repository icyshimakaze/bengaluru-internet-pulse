# Deterministic trend algorithm — v2

The engine measures momentum from distinct public signals. An injected UTC clock and fixed equations determine every metric, score, confidence, lifecycle and tie. OpenAI/mock classification confidence is never a scoring input. Pending, failed and irrelevant items are excluded.

## Evidence and time windows

Deduplicate globally before clustering or counting. IDs, source/source-ID pairs, canonical URLs, stored fingerprints and recomputed normalized content fingerprints identify connected duplicate groups. Keep the earliest publication timestamp, then smallest ID, from each group. This handles repeated polling, cross-source link sharing and exact syndicated content without rewarding an extra source or a refreshed polling timestamp. Near-identical linked articles also connect when title and excerpt each share at least seven substantive tokens, both directions have at least 90% token coverage, numeric tokens agree and timestamps differ by at most 24 hours. Pure social-post/discussion URLs do not qualify for this near-copy rule. Independent event paraphrases remain distinct evidence, even when they share a canonical topic. Coordinated authors are not reliably detectable. These are evidence-quality corrections; the v2 score equations and caps are unchanged, and historical snapshots are not rewritten.

For scoring time `t`, with hours measured from publication/discovery timestamps:

- `c = current_2h`: `(t − 2h, t]`.
- `p = previous_2h`: `(t − 4h, t − 2h]`.
- `count_6h`: `(t − 6h, t]`.
- `count_24h`: `[t − 24h, t]`.
- `distinct_sources`: current-window providers, out of the fixed three providers.
- `latest_signal_age`: hours since the most recent deduplicated signal in 24h; null without evidence.
- `first_seen_at`: earliest observed timestamp, including the persisted topic timestamp and retained older evidence; null when genuinely unknown.

Future and invalid timestamps are excluded. An exact 2h boundary belongs to the previous window, the exact 4h boundary to neither two-hour window, and the exact 24h boundary is retained. Rankings require **two current distinct signals**; single signals still receive diagnostic metrics and snapshots.

## Components and Pulse Score

Let `clamp(x) = min(1, max(0, x))`, `s = distinct_sources`, and `a = latest_signal_age`.

```text
growth_ratio = (c + 1) / (p + 1)
velocity_base = clamp(log2(growth_ratio) / log2(4))
evidence_support = c / (c + 3)
velocity = velocity_base × evidence_support
if p = 0: velocity = min(velocity, 0.65)
volume = clamp(ln(1 + c) / ln(21))
source_diversity = s / 3
recency = exp(−a / 2), or 0 without 24h evidence
raw_score = round(100 × (0.40 × velocity + 0.25 × volume
                         + 0.20 × source_diversity + 0.15 × recency))
```

Volume saturates at 20 signals. Fourfold smoothed growth saturates the velocity base, while limited evidence and a missing baseline reduce velocity. Flat or decreasing counts have zero velocity: volume alone can contribute only 25 points. A genuine burst of eight signals after one baseline signal, across three providers, generally beats a large flat topic with 100 current and 100 baseline signals.

Apply the following **upper caps** after the weighted equation, taking the minimum applicable cap:

- `c = 0`: score 0, absent from ranking.
- `c = 1`: at most 20, absent from ranking and never HOT.
- One provider and `c < 5`: at most 35.
- Any one-provider topic: at most 55, even with extreme volume.
- More than 90% of current signals from one provider: at most 55.
- Cluster consistency below 0.5: at most 60.

Final Pulse Score is the bounded integer 0–100 after these evidence guardrails. Confidence is separate from the weighted sum. Sort by final score descending, velocity descending, then canonical slug in deterministic lexical order.

## Stable change display

The exact growth ratio is exposed numerically. The display uses a three-signal denominator floor and a clearly marked upper bound:

```text
uncapped_change = 100 × (c − p) / max(p, 3)
change_percent = round(min(300, max(−100, uncapped_change)))
change_capped = uncapped_change > 300
```

Show **No baseline** when `p = 0`, **≥300%** when capped, otherwise the signed smoothed percentage. UI text identifies the baseline floor and smoothing; counts remain visible, so this is never presented as exact raw percentage growth. Division by zero and runaway percentages are impossible.

## Separate confidence

Confidence measures corroboration and grouping quality, not truth or unique people.

```text
evidence_confidence = 1 − exp(−c / 6)
diversity_confidence = s / 3
balance = clamp(1 − largest_provider_share + 1 / s), or 0 when s = 0
confidence = clamp((0.55 × evidence_confidence + 0.30 × diversity_confidence
                    + 0.15 × cluster_consistency) × balance
                    × (0.5 + 0.5 × cluster_consistency))
if s = 1: confidence = min(confidence, 0.45)
if c = 1: confidence = min(confidence, 0.25)
```

Cluster consistency is a deterministic lexical check. Tokenize normalized title plus excerpt, discard short words, digits and a fixed stop list of boilerplate/city words, and keep at most 32 distinct tokens per signal. Select at most three terms occurring in at least `max(2, ceil(c / 3))` current signals, ordered by document frequency then lexical order. Consistency is the fraction of current signals sharing one of those terms; it is 0 for no evidence and 0.5 for a single signal. This conservative check can undervalue multilingual synonyms; it neither calls a model nor reuses model confidence.

Labels: **high ≥0.70**, **medium ≥0.35**, **low otherwise**. Components and provider balance are exposed alongside the confidence score for inspection.

## Lifecycle: deterministic precedence

Evaluate in this order:

1. **COOLING**: `c = 0` with retained prior evidence or a known persisted first-seen time; or `p ≥2` and `growth_ratio ≤0.75`. Pruning old items never resets an expired topic to STABLE.
2. **NEW**: one isolated current signal; or first observed within 30 minutes and `count_6h ≤3`.
3. **HOT**: score ≥75, `c ≥6`, at least two providers, confidence ≥0.65, consistency ≥0.5, ratio ≥1.5, and latest signal no older than 30 minutes.
4. **EMERGING**: `p = 0` and `c ≥2`.
5. **RISING**: ratio ≥1.25, net gain ≥2, score ≥45, at least two providers and confidence ≥0.35.
6. **STABLE**: remaining topics, including a no-evidence diagnostic evaluation.

Only evaluations with `c ≥2` enter the public ranked list. Empty/expired stored topics use the internal `inactive` marker, while their diagnostic snapshots retain a six-state lifecycle and score 0. A source outage never reduces the denominator of three or gives surviving providers extra weight.

## Snapshots and versioning

Every completed ingestion publication atomically stores a v2 dashboard snapshot, current topic metrics and history for topics with 24-hour evidence, including NEW, below-threshold and zero-current evaluations. The transition to zero 24-hour evidence is recorded once; repeated empty polls do not append identical archived snapshots. Evidence returning to a topic resumes captures. Source run counters commit in the same transaction; collected pending data survives publication failure. A skipped overlapping run creates no snapshot.

Migration 5 adds v2 lifecycle and telemetry columns without modifying old migration checksums, evidence or historical scores. The original lifecycle columns and 3h counts remain compatibility telemetry; `lifecycle_v2` and `algorithm_version=v2` identify the current contract. Snapshots also retain ratio, first-seen time, latest age, consistency, confidence components, score caps and display-change values. Old v1 history remains labeled v1; current reads can deterministically reevaluate an old dashboard cache from its validated evidence, preserving its collection timestamp and reporting the upgrade.

Hourly 24h histories count actual deduplicated evidence. Stored scoring snapshots aggregate explicitly named neighborhoods in ranked topics' current 2h evidence. The public read/query layer additionally supports 2h/6h/24h neighborhood activity from all relevant canonical topics, including singleton mentions with capped diagnostic scores; this never promotes them into ranking. Shared/syndicated signals count once. Reads age rankings with the real clock, preserve collection timestamps, and mark collections stale after 90 minutes. See [Read API](read-api.md).
