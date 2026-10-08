import { coordinates } from "@/lib/domain/schema";
import type { PublicHotspot } from "@/lib/domain/read-models";

/** Keep unsupported/empty locations off both maps. Only curated centers determine position. */
export function activeHotspots(hotspots: readonly PublicHotspot[]): PublicHotspot[] {
  return hotspots.filter((h) => h.activity > 0 && Object.hasOwn(coordinates, h.neighborhood))
    .map((h) => ({ ...h, lat: coordinates[h.neighborhood][0], lng: coordinates[h.neighborhood][1] }));
}

/** Screen-pixel radius encodes activity; restrained emerald opacity encodes top topic intensity. */
export function hotspotMarkerStyle(activity: number, topPulse: number) {
  const count = Number.isFinite(activity) ? Math.max(0, activity) : 0;
  const intensity = Number.isFinite(topPulse) ? Math.max(0, Math.min(100, topPulse)) / 100 : 0;
  return { radius: Math.min(24, 7 + 2 * Math.sqrt(count)), fillOpacity: 0.16 + 0.5 * intensity,
    weight: 1 + 1.3 * intensity, color: "#11684f", fillColor: "#11684f" };
}
