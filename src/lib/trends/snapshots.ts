import type { Observation, Trend } from "@/lib/domain/schema";
import type { SnapshotRecord } from "@/lib/db/records";
import { HOUR } from "./engine";

export function topicSnapshot(topicId: string, evidence: readonly Observation[], now: Date, trend?: Trend, batchId: string | null = null): SnapshotRecord {
  const end = now.getTime();
  const recent = evidence.filter((o) => { const t = Date.parse(o.publishedAt); return t <= end && t >= end - 24 * HOUR; });
  const window = (hours: number) => recent.filter((o) => Date.parse(o.publishedAt) > end - hours * HOUR);
  const current2 = window(2), current3 = window(3);
  const previous2 = recent.filter((o) => { const t = Date.parse(o.publishedAt); return t > end - 4 * HOUR && t <= end - 2 * HOUR; });
  const baseline3 = recent.filter((o) => { const t = Date.parse(o.publishedAt); return t > end - 6 * HOUR && t <= end - 3 * HOUR; });
  return { topicId, capturedAt: now.toISOString(), count2h: current2.length, previousCount2h: previous2.length, count6h: window(6).length,
    count24h: recent.length, sourceCount: new Set(current2.map((o) => o.source)).size, count3h: current3.length, previousCount3h: baseline3.length,
    scoringSourceCount: new Set(current3.map((o) => o.source)).size, velocityScore: trend?.velocity ?? 0, volumeScore: trend?.volume ?? 0,
    diversityScore: trend?.diversity ?? 0, recencyScore: trend?.recency ?? 0, confidence: trend?.confidence ?? 0,
    pulseScore: trend?.score ?? 0, lifecycle: trend?.lifecycle ?? "inactive", algorithmVersion: "v1", batchId };
}
