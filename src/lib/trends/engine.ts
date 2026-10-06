import { type Observation, type Topic, type Trend, type Hotspot, coordinates, sources } from "@/lib/domain/schema";

export const HOUR = 3600000;
export const ALGORITHM_VERSION = "v1" as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function computeTrends(topics: readonly Topic[], observations: readonly Observation[], now: Date): Trend[] {
  const end = now.getTime();
  const recent = observations.filter((o) => { const t = Date.parse(o.publishedAt); return t <= end && t >= end - 24 * HOUR; });
  const result: Trend[] = [];
  for (const topic of topics) {
    const evidence = recent.filter((o) => o.topicSlug === topic.slug).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
    const current = evidence.filter((o) => Date.parse(o.publishedAt) > end - 3 * HOUR);
    const baseline = evidence.filter((o) => { const t = Date.parse(o.publishedAt); return t > end - 6 * HOUR && t <= end - 3 * HOUR; });
    const c = current.length, b = baseline.length;
    if (c < 2) continue;
    const latest = current[0];
    if (!latest) continue;
    const activeSources = sources.filter((source) => current.some((o) => o.source === source));
    const velocity = clamp((c - b) / (b + 3) / 3);
    const volume = clamp(Math.log1p(c) / Math.log(31));
    const diversity = activeSources.length / sources.length;
    const recency = Math.exp(-(end - Date.parse(latest.publishedAt)) / (3 * HOUR));
    const confidence = Math.min(1, c / 10) * (0.5 + 0.5 * diversity);
    const score = Math.round(100 * (0.4 * velocity + 0.2 * volume + 0.15 * diversity + 0.1 * recency + 0.15 * confidence));
    const growthPercent = Math.round(100 * (c - b) / Math.max(b, 3));
    const smoothed = (c - b) / (b + 3);
    const lifecycle = b < 3 ? "emerging" : smoothed >= 0.25 ? "rising" : smoothed <= -0.2 ? "cooling" : "steady";
    const history = Array.from({ length: 24 }, (_, i) => {
      const start = end - (24 - i) * HOUR;
      return { at: new Date(start).toISOString(), count: evidence.filter((o) => { const t = Date.parse(o.publishedAt); return (i === 0 ? t >= start : t > start) && t <= start + HOUR; }).length };
    });
    result.push({ ...topic, score, currentCount: c, baselineCount: b, totalCount: evidence.length, growthPercent, velocity, volume, diversity, recency, confidence,
      confidenceLabel: confidence >= 0.7 ? "high" : confidence >= 0.35 ? "medium" : "low", lifecycle,
      sources: activeSources, latestAt: latest.publishedAt, history, evidence,
      explanation: `${c} distinct items in the last 3 hours, compared with ${b} in the previous 3 hours, across ${activeSources.length} public ${activeSources.length === 1 ? "source" : "sources"}.` });
  }
  return result.sort((a, b) => b.score - a.score || b.velocity - a.velocity || a.slug.localeCompare(b.slug));
}
export function computeHotspots(trends: readonly Trend[], now: Date): Hotspot[] {
  const map = new Map<string, Hotspot>();
  for (const trend of trends) for (const o of trend.evidence) {
    if (!o.neighborhood || Date.parse(o.publishedAt) <= now.getTime() - 3 * HOUR) continue;
    const location = o.neighborhood;
    const point = map.get(location) ?? { neighborhood: location, lat: coordinates[location][0], lng: coordinates[location][1], count: 0, topics: [] };
    point.count++;
    if (!point.topics.includes(trend.slug)) point.topics.push(trend.slug);
    map.set(location, point);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.neighborhood.localeCompare(b.neighborhood));
}
