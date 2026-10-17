import type { PulseMetadata } from "./dashboard-presentation";
import { isLive, sourceStateAt } from "./dashboard-presentation";
/** Operational presentation ignores enrichment selection/fallback and legacy status. */
export function statusLabel(pulse: PulseMetadata, now: number): string {
  if (pulse.mode === "demo") return "Demo";
  if (!pulse.generatedAt || !pulse.lastSuccessfulIngestion) return "Delayed";
  if (!isLive(pulse, now)) return pulse.stale ? "Stale" : "Delayed";
  if (pulse.sources?.some((source) => (source.consecutiveFailures ?? 0) >= 2 || ["stale"].includes(sourceStateAt(source, now, pulse.mode)))) return "Degraded";
  if (pulse.sources?.some((source) => ["error", "degraded", "unavailable"].includes(sourceStateAt(source, now, pulse.mode)))) return "Limited coverage";
  return "Live";
}
