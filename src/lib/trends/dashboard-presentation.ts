import type { DashboardData, PublicTopic } from "@/lib/domain/read-models";

export const LIVE_FRESHNESS_MS = 45 * 60_000;
export const categoryLabels: Record<PublicTopic["semanticCategory"], string> = {
  civic: "Civic", traffic: "Traffic", technology: "Tech", business: "Business", culture: "Culture",
  food: "Food", events: "Events", weather: "Weather", sports: "Sports", other: "Other",
};
export const filterCategories = ["civic", "traffic", "technology", "business", "culture", "food", "events", "weather", "sports"] as const;
export type PulseMetadata = Pick<DashboardData, "mode" | "status" | "stale" | "lastSuccessfulIngestion" | "evaluatedAt"> & { snapshot: Pick<DashboardData["snapshot"], "refreshDelayed"> };
export function pulseMetadata(pulse: DashboardData): PulseMetadata {
  return { mode: pulse.mode, status: pulse.status, stale: pulse.stale, lastSuccessfulIngestion: pulse.lastSuccessfulIngestion,
    evaluatedAt: pulse.evaluatedAt, snapshot: { refreshDelayed: pulse.snapshot.refreshDelayed } };
}
export function isLive(pulse: PulseMetadata, now: number): boolean {
  if (pulse.mode !== "live" || pulse.status === "unavailable" || pulse.stale || pulse.snapshot.refreshDelayed || !pulse.lastSuccessfulIngestion) return false;
  const age = now - Date.parse(pulse.lastSuccessfulIngestion);
  return Number.isFinite(age) && age >= 0 && age <= LIVE_FRESHNESS_MS;
}
export function elapsedLabel(value: string | null, now: number): string {
  if (!value) return "Awaiting ingestion";
  const age = now - Date.parse(value);
  if (!Number.isFinite(age) || age < 0) return "Timestamp unavailable";
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return `${Math.floor(age / 60_000)} min ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return `${Math.floor(age / 86_400_000)}d ago`;
}
