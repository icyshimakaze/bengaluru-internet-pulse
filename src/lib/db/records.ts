import "server-only";
import { z } from "zod";
import { categorySchema, neighborhoodSchema, sourceSchema, httpUrlSchema, slugSchema, trendLifecycleSchema } from "@/lib/domain/schema";
import { storedEnrichmentProviderSchema } from "@/lib/domain/enrichment-providers";

const timestamp = z.iso.datetime().transform((value) => new Date(value).toISOString());
const id = z.string().min(1).max(200);
const factor = z.number().min(0).max(1);
const count = z.number().int().nonnegative();
export const legacyLifecycleSchema = z.enum(["emerging", "rising", "steady", "cooling", "inactive"]);
export function normalizeLifecycle(value: unknown) {
  const legacy: Record<string, string> = { emerging: "EMERGING", rising: "RISING", steady: "STABLE", cooling: "COOLING" };
  return typeof value === "string" ? legacy[value] ?? value : value;
}
export const lifecycleSchema = z.preprocess(normalizeLifecycle, z.union([trendLifecycleSchema, z.literal("inactive")]));
export function legacyLifecycle(value: z.infer<typeof lifecycleSchema>): z.infer<typeof legacyLifecycleSchema> {
  return value === "NEW" || value === "HOT" || value === "EMERGING" ? "emerging" : value === "RISING" ? "rising" : value === "COOLING" ? "cooling" : value === "STABLE" ? "steady" : "inactive";
}
export const enrichmentStatusSchema = z.enum(["pending", "completed", "irrelevant", "failed"]);
export const itemFieldsSchema = z.object({
  id, source: sourceSchema, sourceId: z.string().min(1).max(2048), canonicalUrl: httpUrlSchema, originalUrl: httpUrlSchema,
  title: z.string().min(3).max(300), excerpt: z.string().min(3).max(4000), domain: z.string().min(1).max(253),
  publishedAt: timestamp, collectedAt: timestamp, contentFingerprint: z.string().min(1),
  topicId: id.nullable(), category: categorySchema.nullable(), neighborhood: neighborhoodSchema.nullable(),
  localRelevance: factor, enrichmentStatus: enrichmentStatusSchema, timeKind: z.enum(["published", "discovered"]),
  ingestionRunId: id.nullable(), isFixture: z.boolean(),
  enrichmentProvider: storedEnrichmentProviderSchema.nullable().default(null),
});
export const itemRecordSchema = itemFieldsSchema.refine((v) => v.collectedAt >= v.publishedAt, "Collection cannot precede publication")
  .refine((v) => v.enrichmentStatus !== "completed" || (v.topicId !== null && v.category !== null), "Completed items need a topic and category")
  .refine((v) => new URL(v.canonicalUrl).hostname === v.domain, "Domain must match canonical URL");
export type ItemRecord = z.infer<typeof itemRecordSchema>;
export const topicFieldsSchema = z.object({
  id, slug: slugSchema, canonicalLabel: z.string().min(3).max(100), category: categorySchema,
  neighborhood: neighborhoodSchema.nullable(), firstSeenAt: timestamp, lastSeenAt: timestamp,
  lifecycle: lifecycleSchema, pulseScore: z.number().int().min(0).max(100), confidence: factor,
  summary: z.string().min(1).max(280), enrichmentMethod: z.enum(["rules", "ai"]), isFixture: z.boolean(),
});
export const topicRecordSchema = topicFieldsSchema.refine((v) => v.lastSeenAt >= v.firstSeenAt, "Last seen cannot precede first seen");
export type TopicRecord = z.infer<typeof topicRecordSchema>;
export const topicUpdateSchema = topicFieldsSchema.partial().omit({ id: true, isFixture: true }).refine((v) => Object.keys(v).length > 0, "Provide at least one topic field");
export type TopicUpdate = z.infer<typeof topicUpdateSchema>;
export const snapshotRecordSchema = z.object({
  topicId: id, capturedAt: timestamp, count2h: count, previousCount2h: count, count6h: count, count24h: count,
  sourceCount: count.max(4), velocityScore: factor, volumeScore: factor, diversityScore: factor, recencyScore: factor,
  confidence: factor, pulseScore: z.number().int().min(0).max(100), lifecycle: lifecycleSchema,
  count3h: count, previousCount3h: count, scoringSourceCount: count.max(3), algorithmVersion: z.enum(["v1", "v2", "v3"]), batchId: id.nullable(),
  growthRatio: z.number().positive().optional(), latestSignalAgeHours: z.number().nonnegative().nullable().optional(), firstSeenAt: timestamp.nullable().optional(),
  clusterConsistency: factor.optional(), evidenceConfidence: factor.optional(), diversityConfidence: factor.optional(), sourceBalance: factor.optional(),
  scoreCap: z.number().int().min(0).max(100).optional(), changePercent: z.number().int().min(-100).max(300).optional(), changeCapped: z.boolean().optional(),
}).refine((v) => v.count2h <= v.count6h && v.count6h <= v.count24h, "Snapshot windows must be consistent")
  .refine((v) => v.algorithmVersion === "v1" || [v.growthRatio,v.latestSignalAgeHours,v.firstSeenAt,v.clusterConsistency,v.evidenceConfidence,v.diversityConfidence,v.sourceBalance,v.scoreCap,v.changePercent,v.changeCapped].every((field) => field !== undefined), "Modern snapshots require scoring telemetry")
  .refine((v) => v.algorithmVersion === "v1" || v.pulseScore <= (v.scoreCap ?? 0), "Score exceeds evidence cap")
  .refine((v) => v.algorithmVersion === "v1" || !v.firstSeenAt || v.firstSeenAt <= v.capturedAt, "First seen cannot follow capture time");
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;
export const ingestionRunSchema = z.object({
  id, source: sourceSchema, startedAt: timestamp, finishedAt: timestamp.nullable(), discovered: count,
  inserted: count, duplicates: count, errors: count,
  status: z.enum(["running", "completed", "partial", "failed", "abandoned"]), errorMessage: z.string().max(1000).nullable(), isFixture: z.boolean(),
}).refine((v) => v.finishedAt === null || v.finishedAt >= v.startedAt, "Finish cannot precede start")
  .refine((v) => (v.status === "running") === (v.finishedAt === null), "Running status must match an unfinished run");
export type IngestionRun = z.infer<typeof ingestionRunSchema>;
export type DuplicateMatch = { item: ItemRecord; reasons: Array<"id" | "source_identity" | "canonical_url" | "content_fingerprint"> };
