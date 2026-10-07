import "server-only";
import { cache } from "react";
import { getEnv } from "./env";
import { log } from "./logger";
import { Repository } from "@/lib/db/repository";
import { getDatabase } from "@/lib/db/client";
import { type Pulse, sources } from "@/lib/domain/schema";
import { demoPulse } from "@/fixtures/demo";
import { computeTrends, computeHotspots } from "@/lib/trends/engine";

export function emptyPulse(now: Date, notice: string): Pulse {
  return { version: "v1", mode: "live", generatedAt: null, evaluatedAt: now.toISOString(), status: "unavailable", stale: true,
    totalSignals: 0, trends: [], hotspots: [], notice,
    sources: sources.map((source) => ({ source, status: "unavailable", checkedAt: now.toISOString(), fetched: 0, accepted: 0, rejected: 0, durationMs: 0 })) };
}
export function ageSnapshot(pulse: Pulse, now: Date): Pulse {
  if (!pulse.generatedAt) return { ...pulse, evaluatedAt: now.toISOString(), stale: true, status: "unavailable" };
  const stale = now.getTime() - Date.parse(pulse.generatedAt) > 90 * 60000;
  const evidence = pulse.trends.flatMap((t) => t.evidence);
  const trends = computeTrends(pulse.trends, evidence, now);
  return { ...pulse, evaluatedAt: now.toISOString(), stale, trends, hotspots: computeHotspots(trends, now),
    status: stale && pulse.status === "healthy" ? "degraded" : pulse.status,
    notice: stale ? ["The last collection is over 90 minutes old. Topics have been aged against the current time; fresh ingestion is needed.", pulse.notice].filter(Boolean).join(" ") : pulse.notice };
}
export const readPulse = cache(async (): Promise<Pulse> => {
  const now = new Date();
  try {
    const env = getEnv();
    if (env.APP_DATA_MODE === "demo") return demoPulse(now);
    if (!env.TURSO_DATABASE_URL) return emptyPulse(now, "Live collection has not been connected yet. Topics will appear after the first successful collection.");
    const snapshot = await new Repository(getDatabase()).latest();
    return snapshot ? ageSnapshot(snapshot, now) : emptyPulse(now, "No live snapshot yet. Topics will appear after the next successful collection.");
  } catch {
    log("error", "read.unavailable", { code: "READ_UNAVAILABLE" });
    return emptyPulse(now, "Live data is temporarily unavailable. Please try again later.");
  }
});
