import { sourceTypeFor, type Observation, type Trend, type Topic } from "@/lib/domain/schema";
import type { SnapshotRecord } from "@/lib/db/records";
import { evaluateTopics, deduplicateEvidence, HOUR, ALGORITHM_VERSION } from "./engine";

export function topicSnapshot(topicId: string, evidence: readonly Observation[], now: Date, trend?: Trend, batchId: string | null = null, topic?: Topic): SnapshotRecord {
  const end = now.getTime();
  const metric = trend ?? evaluateTopics([topic ?? { slug: evidence[0]?.topicSlug ?? "unknown", title: "Unknown topic", category: "City life", description: "Public discussion", method: "rules" }], evidence, now)[0]!;
  const recent = deduplicateEvidence(evidence, now).filter((o) => Date.parse(o.publishedAt) >= end - 24 * HOUR);
  const current3 = recent.filter((o) => Date.parse(o.publishedAt) > end - 3 * HOUR);
  const previous3 = recent.filter((o) => Date.parse(o.publishedAt) > end - 6 * HOUR && Date.parse(o.publishedAt) <= end - 3 * HOUR);
  return { topicId, capturedAt: now.toISOString(), count2h: metric.current2h, previousCount2h: metric.previous2h, count6h: metric.count6h,
    count24h: metric.count24h, sourceCount: metric.sourceCount, count3h: current3.length, previousCount3h: previous3.length,
    scoringSourceCount: new Set(metric.sources.map((source) => sourceTypeFor[source])).size, velocityScore: metric.velocity, volumeScore: metric.volume, diversityScore: metric.diversity,
    recencyScore: metric.recency, confidence: metric.confidence, pulseScore: metric.score, lifecycle: metric.lifecycle,
    algorithmVersion: ALGORITHM_VERSION, batchId, growthRatio: metric.growthRatio, latestSignalAgeHours: metric.latestSignalAgeHours,
    firstSeenAt: metric.firstSeenAt, clusterConsistency: metric.clusterConsistency, evidenceConfidence: metric.evidenceConfidence,
    diversityConfidence: metric.diversityConfidence, sourceBalance: metric.sourceBalance, scoreCap: metric.scoreCap,
    changePercent: metric.growthPercent, changeCapped: metric.changeCapped };
}
