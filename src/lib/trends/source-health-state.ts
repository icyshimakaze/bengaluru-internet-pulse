import type { CollectionRecord, SourceHealthState } from "@/lib/domain/source-health";

export const SOURCE_DELAYED_MS = 45 * 60_000;
export const SOURCE_STALE_MS = 90 * 60_000;

export function collectionState(record: CollectionRecord, now: number): SourceHealthState {
  if (record.health.status === "demo") return "demo";
  const success = record.lastSuccessAt ? Date.parse(record.lastSuccessAt) : NaN;
  const attempt = Date.parse(record.lastAttemptAt);
  if (attempt > now || success > now) return "unavailable";
  const failed = record.health.status === "error";
  if (record.health.status === "unavailable") return "unavailable";
  if (!Number.isFinite(success)) return failed ? "error" : "unavailable";
  if (now - success > SOURCE_STALE_MS) return failed ? "error" : "stale";
  if (failed || record.health.status === "partial") return "degraded";
  if (now - success > SOURCE_DELAYED_MS) return "delayed";
  return "live";
}
