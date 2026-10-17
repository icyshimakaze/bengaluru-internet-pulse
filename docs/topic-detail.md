# Topic intelligence brief

/topic/[slug] reads the validated public topic detail model through server-only queries. It never ingests, contacts source APIs, calls a model, or exposes database credentials. Header metrics use the all-provider deterministic v2 engine: latest two-hour signals, preceding two-hour signals, smoothed change, Pulse Score, confidence, lifecycle, source count, and preserved first-seen timestamp.

## Evidence-grounded explanation

The narrative uses only computed counts and provider coverage from persisted, deduplicated source metadata. Rising, steady, cooling, missing-baseline and zero-current-evidence cases have separate factual descriptions. It does not infer causes, claim an event happened, or describe public attention as factual verification. Directly beneath it, a labeled evidence strip gives the current count, independent provider count, first-seen time and lifecycle. Provider diversity is not a claim of editorial independence.

First detection remains the preserved topic timestamp; source publication or discovery can precede collection. The page labels IST explicitly. GDELT evidence distinguishes discovery from publication. Demo snapshots and example URLs retain a persistent fictional-data label.

## History and lifecycle

The chart uses saved topic snapshots, with 24-hour, seven-day and 30-day windows. It switches between historical Pulse Score and the recorded two-hour signal count. Exact dates, scores, counts, providers and lifecycle appear in a keyboard-accessible, scrollable table. A single snapshot is a single point; missing captures are never replaced by zero values. At most 96 retained records are available, with truncation disclosed.

Algorithm v1 and v2 are separate series; their scores are not compared or combined. Demo history is explicitly labeled deterministic fixture replay. Lifecycle milestones report the first retained EMERGING and RISING v2 snapshots and the earliest retained evidence-bearing maximum v2 score. Missing stages stay “Not observed.” The peak is the retained sampled maximum, not a claim about an all-time peak. Current state and current score are separate from that recorded peak. Stages may recur or regress.

## Location support

The read projection supplies a strict locationEvidence DTO derived from all canonical deduplicated 24-hour evidence, before the 30-item display limit. A named neighborhood requires at least two explicit mentions, at least two source providers, and at least 60% of located signals referring to that neighborhood. Neighborhoods are curated enum values.

Unknown, conflicting or one-provider evidence yields a null neighborhood with unknown, mixed or insufficient status. The page shows Citywide/Unknown and explains the gap. Support describes a place consistently mentioned in source metadata, not a verified incident or an author's location. This rule does not change ranking, trend confidence, or hotspot counts.

## Provenance and disclosures

Evidence cards display provider, title, domain, timestamp, publication/discovery kind, and safe original links. They never reproduce article/post bodies or stored excerpts. Six cards are shown initially; provider filters and expansion inspect the bounded 30-item evidence list. Filter counts explicitly refer to loaded items while topic counts include all distinct observations. Fictional demo links say “Open Example”; live links say “Open Original.”

Client components receive only the displayed evidence provenance fields. Stored excerpts, classification metadata and unused topic fields are omitted from their serialized props.

The expandable score disclosure shows velocity, volume, provider diversity and recency, their normalized values and fixed weights, followed by separate confidence evidence, diversity, cluster consistency and provider balance. Evidence caps and bounded change are explained, with links to full equations.

Related signals come from a different canonical topic sharing the supported semantic category or an explicitly mentioned neighborhood. The broad other category alone does not establish a relationship. They are context, not inferred equivalent events. Four items appear initially; expansion reveals the up-to-12 retained items.

## States and verification

Route-level loading uses a stable skeleton. Missing/malformed topics have an archive-specific not-found page. Known storage failures provide a safe retry using a server router refresh; unexpected errors have a route boundary with the same recovery controls. Neither displays raw diagnostic text. Empty evidence, absent history, missing stages, old records and uncertain places have explicit states.

Tests cover evidence-only explanations, location consistency and dedupe/display limits, archival version isolation, missing stages, absent evidence, unsafe title escaping, original links, no excerpt reproduction, filters and expansion, chart/table controls, keyboard methodology disclosure, retries, not-found behavior, responsive overflow, hydration and WCAG A/AA checks.

Demo evidence has fictional titles and no outgoing original-source links. Live evidence retains safe original-source links. This applies to both the main evidence list and related signals.
# City signal edition topic briefs

Topic briefs share the wide editorial grid, self-hosted typography and semantic colour tokens. The title and score have distinct regions; metrics, evidence explanation, location support, chart history, observed milestones, source ledger and expandable scoring stay in a single coherent reading sequence. Mobile recomposes the score beneath the title and keeps chart dimensions usable.

Share trend invokes Web Share when supported, otherwise copies the stable canonical URL. Success/failure feedback is announced through a live status region. Each topic's Open Graph/Twitter metadata points to `/api/og/[slug]`, a server-generated image with real metrics, timestamp and demo/stale labeling. Missing/unreadable topics never receive fabricated share metrics. Operational detail is progressively disclosed rather than occupying a paragraph above the title.
