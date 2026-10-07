import { z } from "zod";

export const sources = ["gdelt", "bluesky", "hackernews"] as const;
export const sourceSchema = z.enum(sources);
export type Source = z.infer<typeof sourceSchema>;
export const sourceTypes = ["news", "social", "tech"] as const;
export const sourceTypeSchema = z.enum(sourceTypes);
export const sourceTypeFor: Record<Source, (typeof sourceTypes)[number]> = { gdelt: "news", bluesky: "social", hackernews: "tech" };
export const sourceNames: Record<Source, string> = { gdelt: "GDELT", bluesky: "Bluesky", hackernews: "Hacker News" };
export const categories = ["Mobility", "Weather", "Technology", "City life", "Civic"] as const;
export const categorySchema = z.enum(categories);
export const neighborhoods = ["Whitefield", "Indiranagar", "Koramangala", "Hebbal", "Electronic City", "Yelahanka", "Jayanagar", "Marathahalli", "HSR Layout", "MG Road"] as const;
export const neighborhoodSchema = z.enum(neighborhoods);
export type Neighborhood = z.infer<typeof neighborhoodSchema>;
export const coordinates: Record<Neighborhood, [number, number]> = {
  Whitefield: [12.9698, 77.7500], Indiranagar: [12.9784, 77.6408], Koramangala: [12.9352, 77.6245],
  Hebbal: [13.0354, 77.5988], "Electronic City": [12.8452, 77.6602], Yelahanka: [13.1005, 77.5963],
  Jayanagar: [12.9250, 77.5938], Marathahalli: [12.9591, 77.6974], "HSR Layout": [12.9116, 77.6389], "MG Road": [12.9756, 77.6066],
};
export const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const httpUrlSchema = z.url().refine((value) => /^https?:\/\//.test(value), "Only HTTP(S) URLs are allowed");
export const topicSchema = z.object({
  slug: slugSchema, title: z.string().min(3).max(100), category: categorySchema,
  description: z.string().min(1).max(280), method: z.enum(["rules", "ai"]),
});
export type Topic = z.infer<typeof topicSchema>;
export const normalizedSignalSchema = z.object({
  source: sourceSchema, sourceId: z.string().min(1), url: httpUrlSchema, title: z.string().min(3).max(300),
  excerpt: z.string().min(3).max(4000), publishedAt: z.iso.datetime(), domain: z.string().min(1), sourceType: sourceTypeSchema,
});
export type NormalizedSignal = z.infer<typeof normalizedSignalSchema>;
const signalFieldsSchema = normalizedSignalSchema.extend({
  id: z.string(),
  canonicalUrl: httpUrlSchema, contentHash: z.string(), title: z.string().min(3).max(300),
  text: z.string().min(3).max(4000), publishedAt: z.iso.datetime(), collectedAt: z.iso.datetime(),
  timeKind: z.enum(["published", "discovered"]),
});
// Read old snapshots without changing their identities, timestamps or scores.
function upgradeSignal(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const v = input as Record<string, unknown>;
  let domain = v.domain;
  if (domain === undefined && typeof (v.canonicalUrl ?? v.url) === "string") {
    try { domain = new URL(String(v.canonicalUrl ?? v.url)).hostname; } catch { /* Zod rejects the URL below. */ }
  }
  return { ...v, excerpt: v.excerpt ?? v.text, domain, sourceType: v.sourceType ?? sourceTypeFor[v.source as Source] };
}
export const signalSchema = z.preprocess(upgradeSignal, signalFieldsSchema);
export type Signal = z.infer<typeof signalSchema>;
export const observationSchema = z.preprocess(upgradeSignal, signalFieldsSchema.extend({ topicSlug: slugSchema, neighborhood: neighborhoodSchema.nullable() }));
export type Observation = z.infer<typeof observationSchema>;
export const sourceStatusSchema = z.object({
  source: sourceSchema, status: z.enum(["ok", "partial", "error", "demo", "unavailable"]),
  fetched: z.number().int().nonnegative(), accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(), durationMs: z.number().nonnegative(),
  checkedAt: z.iso.datetime(), error: z.string().optional(),
  queries: z.number().int().nonnegative().optional(), failedQueries: z.number().int().nonnegative().optional(),
  duplicates: z.number().int().nonnegative().optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export const trendSchema = topicSchema.extend({
  score: z.number().min(0).max(100), currentCount: z.number().int().nonnegative(),
  baselineCount: z.number().int().nonnegative(), totalCount: z.number().int().nonnegative(),
  growthPercent: z.number(), velocity: z.number().min(0).max(1), volume: z.number().min(0).max(1),
  diversity: z.number().min(0).max(1), recency: z.number().min(0).max(1), confidence: z.number().min(0).max(1),
  confidenceLabel: z.enum(["high", "medium", "low"]), lifecycle: z.enum(["emerging", "rising", "cooling", "steady"]),
  sources: z.array(sourceSchema), latestAt: z.iso.datetime(), explanation: z.string(),
  history: z.array(z.object({ at: z.iso.datetime(), count: z.number().int().nonnegative() })),
  evidence: z.array(observationSchema),
});
export type Trend = z.infer<typeof trendSchema>;
export const hotspotSchema = z.object({ neighborhood: neighborhoodSchema, lat: z.number(), lng: z.number(), count: z.number().int().nonnegative(), topics: z.array(slugSchema) });
export type Hotspot = z.infer<typeof hotspotSchema>;
export const pulseSchema = z.object({
  version: z.literal("v1"), mode: z.enum(["demo", "live"]), generatedAt: z.iso.datetime().nullable(), evaluatedAt: z.iso.datetime(),
  stale: z.boolean(), status: z.enum(["demo", "healthy", "degraded", "unavailable"]),
  trends: z.array(trendSchema), hotspots: z.array(hotspotSchema), sources: z.array(sourceStatusSchema),
  totalSignals: z.number().int().nonnegative(), notice: z.string().nullable(),
  enrichment: z.object({ provider: z.enum(["mock", "openai", "off"]), pending: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(), irrelevant: z.number().int().nonnegative() }).optional(),
});
export type Pulse = z.infer<typeof pulseSchema>;
