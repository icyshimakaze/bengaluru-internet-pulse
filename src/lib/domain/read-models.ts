import { z } from "zod";
import { categorySchema, sourceSchema, sourceTypeSchema, slugSchema, neighborhoodSchema, httpUrlSchema,
  trendSchema, pulseSchema, hotspotSchema, sourceStatusSchema, trendLifecycleSchema } from "./schema";
import { semanticCategorySchema } from "./enrichment";
import { storedEnrichmentProviderSchema } from "./enrichment-providers";
import { sourceHealthStateSchema } from "./source-health";
import { languages } from "./language";

// Retain the original editorial buckets for existing API consumers.
export const readCategorySchema = z.union([semanticCategorySchema, categorySchema]);
export const readQuerySchema = z.object({ window: z.enum(["2h", "6h", "24h"]).default("2h"),
  category: readCategorySchema.optional(), source: sourceSchema.optional() }).strict();
export type ReadQuery = z.infer<typeof readQuerySchema>;
export type ReadQueryInput = z.input<typeof readQuerySchema>;
export const dashboardQuerySchema = readQuerySchema.extend({ window: z.enum(["now", "2h", "6h", "24h"]).default("now") });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardQueryInput = z.input<typeof dashboardQuerySchema>;
export const topicListQuerySchema = readQuerySchema.extend({ q: z.string().max(100).optional(), lifecycle: trendLifecycleSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export type TopicListQuery = z.infer<typeof topicListQuerySchema>;
export const publicSignalSchema = z.object({ id: z.string().min(1), source: sourceSchema, sourceType: sourceTypeSchema,
  url: httpUrlSchema, title: z.string().min(3).max(300), excerpt: z.string().max(600), domain: z.string().min(1),
  publishedAt: z.iso.datetime(), timeKind: z.enum(["published", "discovered"]), topicSlug: slugSchema.nullable(),
  language: z.enum(languages).optional(),
  neighborhood: neighborhoodSchema.nullable(), enrichmentStatus: z.enum(["pending", "completed", "failed"]),
  enrichmentProvider: storedEnrichmentProviderSchema.nullable().default(null) }).strict();
export type PublicSignal = z.infer<typeof publicSignalSchema>;
export const publicTopicSchema = trendSchema.omit({ method: true, currentCount: true, baselineCount: true, totalCount: true, evidence: true })
  .extend({ activityCount: z.number().int().nonnegative(), semanticCategory: semanticCategorySchema,
    neighborhood: neighborhoodSchema.nullable() }).strict();
export type PublicTopic = z.infer<typeof publicTopicSchema>;
export const recentConversationSchema = z.object({ slug: slugSchema, title: z.string().min(3).max(100),
  category: semanticCategorySchema, neighborhood: neighborhoodSchema.nullable(), latestAt: z.iso.datetime(),
  signalCount: z.number().int().positive(), sources: z.array(sourceSchema).min(1).max(4) }).strict();
export const publicSourceSchema = sourceStatusSchema.omit({ error: true }).extend({ stale: z.boolean(),
  ingestionStatus: z.enum(["running", "completed", "partial", "failed", "abandoned"]).nullable(),
  healthState: sourceHealthStateSchema,
  lastAttemptAt: z.iso.datetime().nullable(), lastSuccessAt: z.iso.datetime().nullable(), lastItemAt: z.iso.datetime().nullable(),
  lastErrorAt: z.iso.datetime().nullable(), lastErrorType: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/u).nullable(),
  itemsLastRun: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative().optional(),
}).strict();
export const publicRunSchema = z.object({ source: sourceSchema, startedAt: z.iso.datetime(), finishedAt: z.iso.datetime().nullable(),
  status: z.enum(["running", "completed", "partial", "failed", "abandoned"]), discovered: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), errors: z.number().int().nonnegative() }).strict();
export const snapshotInfoSchema = z.object({ algorithmVersion: z.literal("v3"), storedVersion: z.enum(["v1", "v2"]).nullable(),
  capturedAt: z.iso.datetime().nullable(), evaluatedAt: z.iso.datetime(), ageSeconds: z.number().nonnegative().nullable(),
  cacheAgeSeconds: z.number().nonnegative(), refreshDelayed: z.boolean(),
  scoringWindow: z.literal("2h"), queryWindow: readQuerySchema.shape.window, stale: z.boolean() }).strict();
export const publicHotspotSchema = hotspotSchema.extend({ activity: z.number().int().nonnegative(),
  averagePulse: z.number().min(0).max(100), topPulse: z.number().min(0).max(100),
  topTopic: z.object({ slug: slugSchema, title: z.string(), pulseScore: z.number().min(0).max(100) }).strict() }).strict();
export type PublicHotspot = z.infer<typeof publicHotspotSchema>;
export const dashboardSchema = pulseSchema.omit({ trends: true, hotspots: true, sources: true }).extend({
  requestedWindow: dashboardQuerySchema.shape.window,
  window: readQuerySchema.shape.window, filters: z.object({ category: readCategorySchema.nullable(), source: sourceSchema.nullable() }).strict(),
  topTopics: z.array(publicTopicSchema).max(50), risingTopics: z.array(publicTopicSchema).max(50),
  recentConversations: z.array(recentConversationSchema).max(8).default([]),
  topicsTruncated: z.boolean(), sourceStream: z.array(publicSignalSchema).max(30), streamTruncated: z.boolean(),
  signalCount: z.number().int().nonnegative(), snapshot: snapshotInfoSchema,
  lastSuccessfulIngestion: z.iso.datetime().nullable(), availableSources: z.array(sourceSchema),
  sources: z.array(publicSourceSchema), hotspots: z.array(publicHotspotSchema),
}).strict();
export type DashboardData = z.infer<typeof dashboardSchema>;
export const topicListSchema = z.object({ mode: pulseSchema.shape.mode, status: pulseSchema.shape.status, generatedAt: z.iso.datetime().nullable(),
  stale: z.boolean(), total: z.number().int().nonnegative(), topics: z.array(publicTopicSchema).max(100), snapshot: snapshotInfoSchema }).strict();
const count = z.number().int().nonnegative(), factor = z.number().min(0).max(1);
export const historySnapshotSchema = z.object({ capturedAt: z.iso.datetime(), algorithmVersion: z.enum(["v1", "v2", "v3"]),
  count2h: count, previousCount2h: count, count6h: count, count24h: count, sourceCount: count.max(4),
  pulseScore: z.number().min(0).max(100), confidence: factor, lifecycle: z.union([trendLifecycleSchema, z.literal("inactive")]),
  velocityScore: factor, volumeScore: factor, diversityScore: factor, recencyScore: factor }).strict();
export type HistorySnapshot = z.infer<typeof historySnapshotSchema>;
export const locationEvidenceSchema = z.object({
  neighborhood: neighborhoodSchema.nullable(), status: z.enum(["supported", "mixed", "insufficient", "unknown"]),
  mentionCount: count, locatedSignalCount: count, sourceCount: count.max(4),
}).strict().refine((v) => (v.status === "supported") === (v.neighborhood !== null), "Only supported locations can name a neighborhood")
  .refine((v) => v.mentionCount <= v.locatedSignalCount && v.sourceCount <= v.mentionCount, "Location evidence counts must be consistent")
  .refine((v) => v.status !== "supported" || v.mentionCount >= 2 && v.sourceCount >= 2 && v.mentionCount / v.locatedSignalCount >= 0.6,
    "Supported locations require corroborating explicit mentions");
export type LocationEvidence = z.infer<typeof locationEvidenceSchema>;
export const topicDetailSchema = z.object({ mode: z.enum(["live", "demo"]), status: pulseSchema.shape.status,
  generatedAt: z.iso.datetime().nullable(), stale: z.boolean(), notice: z.string().nullable(), snapshot: snapshotInfoSchema,
  topic: publicTopicSchema, summary: z.string().max(280), pulseScore: z.number().min(0).max(100),
  growth: z.object({ current2h: count, previous2h: count, ratio: z.number().positive(), changePercent: z.number().min(-100).max(300), capped: z.boolean() }).strict(),
  confidence: factor, lifecycle: trendLifecycleSchema, history: z.array(historySnapshotSchema).max(96), historyTruncated: z.boolean(),
  locationEvidence: locationEvidenceSchema,
  sourceEvidence: z.array(publicSignalSchema).max(30), evidenceTruncated: z.boolean(), relatedSignals: z.array(publicSignalSchema).max(12),
}).strict();
export type TopicDetailData = z.infer<typeof topicDetailSchema>;
export const hotspotsResponseSchema = z.object({ mode: z.enum(["live", "demo"]), status: pulseSchema.shape.status,
  generatedAt: z.iso.datetime().nullable(), stale: z.boolean(), snapshot: snapshotInfoSchema,
  window: readQuerySchema.shape.window, hotspots: z.array(publicHotspotSchema), locationBasis: z.string() }).strict();
export const healthSchema = z.object({ status: pulseSchema.shape.status, mode: z.enum(["live", "demo"]), version: z.literal("v2"),
  generatedAt: z.iso.datetime().nullable(), stale: z.boolean(), application: z.object({ status: z.literal("ok"), checkedAt: z.iso.datetime() }).strict(),
  database: z.object({ status: z.enum(["ok", "unconfigured", "unavailable", "not_required"]), checkedAt: z.iso.datetime() }).strict(),
  lastIngestion: publicRunSchema.nullable(), lastSuccessfulIngestion: z.iso.datetime().nullable(),
  sources: z.array(publicSourceSchema), availableSources: z.array(sourceSchema), recentSignalCount: count.nullable(),
  recentWindow: z.literal("24h"), simulated: z.boolean() }).strict();
export type HealthData = z.infer<typeof healthSchema>;
