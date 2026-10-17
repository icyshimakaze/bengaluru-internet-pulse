import type { DashboardData, PublicTopic } from "@/lib/domain/read-models";
import { collectionState } from "./source-health-state";

export function sourceStateAt(source: DashboardData["sources"][number], now: number, mode: "live" | "demo") {
  return mode === "demo" ? "demo" : collectionState({ health: source, lastAttemptAt: source.lastAttemptAt ?? source.checkedAt,
    lastSuccessAt: source.lastSuccessAt, lastItemAt: source.lastItemAt, lastErrorAt: source.lastErrorAt,
    lastErrorType: source.lastErrorType, itemsLastRun: source.itemsLastRun }, now);
}

export const LIVE_FRESHNESS_MS = 45 * 60_000;
export function emptyDashboardState(pulse: DashboardData, filtered: boolean) {
  if (pulse.mode === "live" && (!pulse.generatedAt || pulse.status === "unavailable" || pulse.stale || pulse.snapshot.refreshDelayed || !pulse.availableSources.length)) {
    return { eyebrow: "COLLECTION DELAYED", title: pulse.generatedAt ? "Waiting for fresh evidence" : "Waiting for a pulse",
      description: "Recent source coverage is missing or delayed. There is not enough fresh evidence to say what is rising across the city." };
  }
  if (filtered) return { eyebrow: "THIS SELECTION", title: "No matching conversations",
    description: "No topics meet the evidence threshold for this selection. Try another category, a wider window or clear the filters." };
  if (pulse.mode === "live" && pulse.status === "degraded") return { eyebrow: "LIMITED COVERAGE", title: "No trend meets the evidence threshold",
    description: "Only part of the public-source coverage is available. A topic needs at least two distinct recent signals to enter the ranking." };
  return { eyebrow: "A QUIET WINDOW", title: "No trend meets the evidence threshold",
    description: "No topic has enough distinct recent evidence to enter the ranking. Try a wider activity window or check again after the next collection." };
}
export const categoryLabels: Record<PublicTopic["semanticCategory"], string> = {
  civic: "Civic", traffic: "Traffic", technology: "Tech", business: "Business", culture: "Culture",
  food: "Food", events: "Events", weather: "Weather", sports: "Sports", other: "Other", jobs: "Jobs",
};
export const filterCategories = ["civic", "traffic", "technology", "business", "culture", "food", "events", "weather", "sports", "jobs"] as const;
export type PulseMetadata = Pick<DashboardData, "mode" | "status" | "stale" | "lastSuccessfulIngestion" | "evaluatedAt"> & {
  snapshot: Pick<DashboardData["snapshot"], "refreshDelayed">;
  sources?: DashboardData["sources"]; enrichment?: DashboardData["enrichment"]; generatedAt?: string | null; totalSignals?: number;
};
export function pulseMetadata(pulse: DashboardData): PulseMetadata {
  return { mode: pulse.mode, status: pulse.status, stale: pulse.stale, lastSuccessfulIngestion: pulse.lastSuccessfulIngestion,
    evaluatedAt: pulse.evaluatedAt, snapshot: { refreshDelayed: pulse.snapshot.refreshDelayed },
    sources: pulse.sources, enrichment: pulse.enrichment, generatedAt: pulse.generatedAt, totalSignals: pulse.totalSignals };
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
