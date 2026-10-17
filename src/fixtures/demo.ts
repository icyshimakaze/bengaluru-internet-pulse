import { type Observation, type Pulse, type Topic, coreSources as sources } from "@/lib/domain/schema";
import { normalize } from "@/lib/pipeline/normalize";
import { topicRules } from "@/lib/pipeline/topics";
import { computeTrends, computeHotspots, HOUR } from "@/lib/trends/engine";

export const FIXTURE_NOW = new Date("2026-10-06T10:30:00.000Z");
export function demoDataset(now = FIXTURE_NOW): { topics: Topic[]; observations: Observation[] } {
  const definitions = [
    { slug: "namma-metro", current: 24, baseline: 5, neighborhood: "Whitefield" as const, text: "Bengaluru Namma Metro service discussion in Whitefield" },
    { slug: "rain-and-waterlogging", current: 18, baseline: 4, neighborhood: "Hebbal" as const, text: "Bengaluru rain and waterlogging discussion in Hebbal" },
    { slug: "startup-ecosystem", current: 13, baseline: 7, neighborhood: "Koramangala" as const, text: "Bengaluru startup ecosystem discussion in Koramangala" },
    { slug: "food-and-cafes", current: 8, baseline: 2, neighborhood: "Indiranagar" as const, text: "Bengaluru cafe and coffee discussion in Indiranagar" },
    { slug: "traffic-and-commutes", current: 11, baseline: 17, neighborhood: "Marathahalli" as const, text: "Bengaluru traffic and commute discussion in Marathahalli" },
    { slug: "arts-and-events", current: 5, baseline: 5, neighborhood: "MG Road" as const, text: "Bengaluru music and arts festival discussion on MG Road" },
  ];
  const topics: Topic[] = [];
  const observations: Observation[] = [];
  for (const [topicIndex, def] of definitions.entries()) {
    const rule = topicRules.find((t) => t.slug === def.slug);
    if (!rule) continue;
    const { pattern: _pattern, ...topic } = rule; void _pattern; topics.push(topic);
    const add = (count: number, start: number, span: number, prefix: string) => {
      for (let i = 0; i < count; i++) {
        const index = `${prefix}-${i}`;
        const signal = normalize({ source: sources[(i + topicIndex) % 3]!, sourceId: `${def.slug}-${index}`,
          url: `https://example.com/fixtures/${def.slug}/${index}`,
          title: `${def.text} · example ${index}`, publishedAt: new Date(now.getTime() - (start + (i + 0.2) / count * span) * HOUR).toISOString() }, now);
        if (signal) observations.push({ ...signal, topicSlug: def.slug, neighborhood: i % 4 === 0 ? null : def.neighborhood });
      }
    };
    add(def.current, 0.05, 1.8, "current");
    add(def.baseline, 2.1, 1.7, "baseline");
    add(12 + topicIndex * 2, 6.1, 17.7, "history");
  }
  return { topics, observations };
}
export function demoPulse(now: Date): Pulse {
  const { topics, observations } = demoDataset(now);
  const trends = computeTrends(topics, observations, now);
  return { version: "v2", mode: "demo", generatedAt: now.toISOString(), evaluatedAt: now.toISOString(), stale: false, status: "demo",
    trends, hotspots: computeHotspots(trends, now), totalSignals: observations.length,
    sources: sources.map((source) => ({ source, status: "demo", fetched: observations.filter((o) => o.source === source).length, accepted: observations.filter((o) => o.source === source).length, rejected: 0, durationMs: 0, checkedAt: now.toISOString() })),
    notice: "Demo mode · fictional example signals. Live collection is available when a database and ingestion schedule are configured." };
}
