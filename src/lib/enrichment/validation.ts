import "server-only";
import type { Signal } from "@/lib/domain/schema";
import { enrichmentBatchSchema, validateEnrichment, type EnrichmentResult, type EnrichmentTopic } from "@/lib/domain/enrichment";

export function validateBatch(output: unknown, signals: Signal[], catalog: EnrichmentTopic[]): EnrichmentResult[] {
  const parsed = enrichmentBatchSchema.parse(output);
  const byId = new Map(signals.map((s) => [s.id, s]));
  const ids = new Set(parsed.items.map((i) => i.signal_id));
  if (ids.size !== signals.length || byId.size !== signals.length || parsed.items.length !== signals.length ||
      parsed.items.some((i) => !byId.has(i.signal_id))) throw new Error("ENRICHMENT_BATCH_IDS");
  const valid = parsed.items.map((item) => validateEnrichment(item, byId.get(item.signal_id)!, catalog));
  const proposals = new Map<string, EnrichmentResult>();
  for (const item of valid) if (item.new_topic) {
    const other = proposals.get(item.slug), known = catalog.find((t) => t.slug === item.slug);
    if (other && (other.canonical_label !== item.canonical_label || other.category !== item.category) ||
        known && (known.canonical_label !== item.canonical_label || known.category !== item.category)) throw new Error("ENRICHMENT_TOPIC_COLLISION");
    proposals.set(item.slug, item);
  }
  return valid;
}
