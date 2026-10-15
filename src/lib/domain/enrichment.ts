import { z } from "zod";
import { neighborhoods, slugSchema, type Signal, type Topic } from "./schema";
import type { EnrichmentProviderName } from "./enrichment-providers";
import { mentionedNeighborhoods } from "@/lib/pipeline/location";
export { enrichmentProviderSchema } from "./enrichment-providers";

export const semanticCategories = ["civic", "traffic", "technology", "business", "culture", "food", "events", "weather", "sports", "other"] as const;
export const semanticCategorySchema = z.enum(semanticCategories);
export const semanticNeighborhoodSchema = z.enum(["Citywide", "Unknown", ...neighborhoods]);
const label = z.string().min(3).max(100).regex(/^[^<>\x00-\x1f]+$/);
const identity = z.string().min(1).max(200);
export const enrichmentTopicSchema = z.object({
  id: identity, slug: slugSchema, canonical_label: label, category: semanticCategorySchema,
}).strict();
export type EnrichmentTopic = z.infer<typeof enrichmentTopicSchema>;
// Keep refinements outside the Responses JSON schema. Check cross-field rules locally.
export const enrichmentResultSchema = z.object({
  signal_id: identity, existing_topic_id: identity.nullable(),
  new_topic: z.object({ canonical_label: label, slug: slugSchema, category: semanticCategorySchema }).strict().nullable(),
  canonical_label: label, slug: slugSchema, category: semanticCategorySchema,
  neighborhood: semanticNeighborhoodSchema, local_relevance: z.number().min(0).max(1),
  summary: z.string().trim().min(3).max(280), confidence: z.number().min(0).max(1),
}).strict();
export const enrichmentBatchSchema = z.object({ items: z.array(enrichmentResultSchema).max(10) }).strict();
export type EnrichmentResult = z.infer<typeof enrichmentResultSchema>;
export const PRODUCTION_MODEL = "gpt-6-luna" as const;
export type EnrichmentAssignment = { result: EnrichmentResult; topic: EnrichmentTopic | null; provider: EnrichmentProviderName; model: string | null };
export const editorialCategory: Record<EnrichmentResult["category"], Topic["category"]> = {
  civic: "Civic", traffic: "Mobility", technology: "Technology", business: "Technology",
  culture: "City life", food: "City life", events: "City life", weather: "Weather", sports: "City life", other: "City life",
};
export const legacySemanticCategory: Record<Topic["category"], EnrichmentResult["category"]> = {
  Civic: "civic", Mobility: "traffic", Technology: "technology", Weather: "weather", "City life": "other",
};
const normalizeText = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function validateEnrichment(input: unknown, signal: Signal, catalog: EnrichmentTopic[], supportedProposals: EnrichmentTopic[] = []): EnrichmentResult {
  const item = enrichmentResultSchema.parse(input);
  if (item.signal_id !== signal.id) throw new Error("ENRICHMENT_SIGNAL_ID");
  if ((item.existing_topic_id === null) === (item.new_topic === null)) throw new Error("ENRICHMENT_TOPIC_CHOICE");
  const existing = item.existing_topic_id ? catalog.find((t) => t.id === item.existing_topic_id) : null;
  const proposed = item.new_topic;
  if (item.existing_topic_id && !existing) throw new Error("ENRICHMENT_TOPIC_ID");
  const target = existing ?? proposed;
  if (!target || item.slug !== target.slug || item.canonical_label !== target.canonical_label || item.category !== target.category)
    throw new Error("ENRICHMENT_TOPIC_METADATA");
  const text = normalizeText(`${signal.title} ${signal.excerpt.slice(0, 1000)}`);
  if (item.neighborhood !== "Citywide" && item.neighborhood !== "Unknown") {
    const areas = mentionedNeighborhoods(text);
    if (areas.length !== 1 || areas[0] !== item.neighborhood) throw new Error("ENRICHMENT_LOCATION_UNSUPPORTED");
  }
  if (item.summary.trim().split(/\s+/u).length > 25 || /[<>\x00-\x1f]/.test(item.summary)) throw new Error("ENRICHMENT_SUMMARY_LENGTH");
  // An extractive span or neutral attribution to supplied metadata avoids new event assertions.
  const summary = normalizeText(item.summary);
  const span = summary.replace(/^public mentions: /, "");
  if (span.trim().length < 3) throw new Error("ENRICHMENT_SUMMARY_UNSUPPORTED");
  const attributed = summary === normalizeText(`Public mentions of ${item.canonical_label}.`);
  if (!text.includes(span) && !(attributed && (existing || text.includes(normalizeText(item.canonical_label)))))
    throw new Error("ENRICHMENT_SUMMARY_UNSUPPORTED");
  if (proposed) {
    const words = normalizeText(proposed.canonical_label).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    const content = words.filter((w) => !["bengaluru", "bangalore", "public", "mentions", "discussion", "other", "the", "and"].includes(w));
    if (!content.some((w) => text.includes(w)) && item.confidence >= 0.6 && item.local_relevance >= 0.5) throw new Error("ENRICHMENT_LABEL_UNSUPPORTED");
    const knownLabel = [...catalog, ...supportedProposals].some((topic) => topic.slug === proposed.slug && topic.canonical_label === proposed.canonical_label && topic.category === proposed.category);
    for (const number of proposed.canonical_label.match(/\d+/g) ?? []) if (!knownLabel && !text.includes(number)) throw new Error("ENRICHMENT_LABEL_UNSUPPORTED");
  }
  return item;
}
