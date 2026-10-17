import { z } from "zod";
import { enrichmentRunSchema } from "./enrichment-providers";
import { httpUrlSchema } from "./urls";
import { sources, sourceTypes, sourceTypeFor } from "./source-labels";
import { neighborhoods } from "./places";
export { neighborhoods, coordinates } from "./places";
export { sources, sourceTypes, sourceTypeFor, sourceNames, coreSources } from "./source-labels";
export { httpUrlSchema } from "./urls";

export const sourceSchema = z.enum(sources);
export type Source = z.infer<typeof sourceSchema>;
export const sourceTypeSchema = z.enum(sourceTypes);
export const categories = ["Mobility", "Weather", "Technology", "City life", "Civic"] as const;
export const categorySchema = z.enum(categories);
export const neighborhoodSchema = z.enum(neighborhoods);
export type Neighborhood = z.infer<typeof neighborhoodSchema>;
export const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const lifecycles = ["NEW", "EMERGING", "RISING", "HOT", "STABLE", "COOLING"] as const;
export const trendLifecycleSchema = z.enum(lifecycles);
export const topicSchema = z.object({
  slug: slugSchema, title: z.string().min(3).max(100), category: categorySchema,
  description: z.string().min(1).max(280), method: z.enum(["rules", "ai"]),
  firstSeenAt: z.iso.datetime().nullable().optional(),
});
export type Topic = z.infer<typeof topicSchema>;
export const normalizedSignalSchema = z.object({
  source: sourceSchema, sourceId: z.string().min(1).max(2048), url: httpUrlSchema, title: z.string().min(3).max(300),
  excerpt: z.string().min(3).max(4000), publishedAt: z.iso.datetime(), domain: z.string().min(1).max(253), sourceType: sourceTypeSchema,
});
export type NormalizedSignal = z.infer<typeof normalizedSignalSchema>;
const signalFieldsSchema = normalizedSignalSchema.extend({
  id: z.string().min(1).max(200),
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
export const legacyTrendSchema = topicSchema.extend({
  score: z.number().min(0).max(100), currentCount: z.number().int().nonnegative(),
  baselineCount: z.number().int().nonnegative(), totalCount: z.number().int().nonnegative(),
  growthPercent: z.number(), velocity: z.number().min(0).max(1), volume: z.number().min(0).max(1),
  diversity: z.number().min(0).max(1), recency: z.number().min(0).max(1), confidence: z.number().min(0).max(1),
  confidenceLabel: z.enum(["high", "medium", "low"]), lifecycle: z.enum(["emerging", "rising", "cooling", "steady"]),
  sources: z.array(sourceSchema), latestAt: z.iso.datetime(), explanation: z.string(),
  history: z.array(z.object({ at: z.iso.datetime(), count: z.number().int().nonnegative() })),
  evidence: z.array(observationSchema),
});
export const trendSchema = legacyTrendSchema.omit({ lifecycle: true }).extend({
  lifecycle: trendLifecycleSchema, current2h: z.number().int().nonnegative(), previous2h: z.number().int().nonnegative(),
  count6h: z.number().int().nonnegative(), count24h: z.number().int().nonnegative(), sourceCount: z.number().int().min(0).max(sources.length),
  growthRatio: z.number().positive(), growthPercent: z.number().min(-100).max(300), changeCapped: z.boolean(),
  latestAt: z.iso.datetime().nullable(), latestSignalAgeHours: z.number().nonnegative().nullable(), firstSeenAt: z.iso.datetime().nullable(),
  clusterConsistency: z.number().min(0).max(1), evidenceConfidence: z.number().min(0).max(1),
  diversityConfidence: z.number().min(0).max(1), sourceBalance: z.number().min(0).max(1), scoreCap: z.number().int().min(0).max(100),
});
export type Trend = z.infer<typeof trendSchema>;
export const hotspotSchema = z.object({ neighborhood: neighborhoodSchema, lat: z.number(), lng: z.number(), count: z.number().int().nonnegative(), topics: z.array(slugSchema) });
export type Hotspot = z.infer<typeof hotspotSchema>;
export const pulseSchema = z.object({
  version: z.literal("v2"), mode: z.enum(["demo", "live"]), generatedAt: z.iso.datetime().nullable(), evaluatedAt: z.iso.datetime(),
  stale: z.boolean(), status: z.enum(["demo", "healthy", "degraded", "unavailable"]),
  trends: z.array(trendSchema), hotspots: z.array(hotspotSchema), sources: z.array(sourceStatusSchema),
  totalSignals: z.number().int().nonnegative(), notice: z.string().nullable(),
  enrichment: z.object({ provider: z.enum(["openai", "xkiro", "heuristic", "mixed", "none", "mock", "off"]), pending: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(), irrelevant: z.number().int().nonnegative(), run: enrichmentRunSchema.optional() }).optional(),
});
export type Pulse = z.infer<typeof pulseSchema>;
export const legacyPulseSchema = pulseSchema.extend({ version: z.literal("v1"), trends: z.array(legacyTrendSchema) });
export const storedPulseSchema = z.discriminatedUnion("version", [legacyPulseSchema, pulseSchema]);
