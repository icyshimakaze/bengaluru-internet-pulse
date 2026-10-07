import { legacyPulseSchema, pulseSchema, type Pulse, type Topic, type Observation } from "@/lib/domain/schema";
import { computeTrends, computeHotspots } from "./engine";

// Reads may reevaluate an old cache, but never rewrite historical stored scores.
export function upgradeLegacyPulse(input: unknown, topics: Topic[] = [], observations: Observation[] = []): Pulse {
  const old = legacyPulseSchema.parse(input), at = new Date(old.generatedAt ?? old.evaluatedAt);
  const catalog = new Map<string, Topic>(old.trends.map((t) => [t.slug, { slug: t.slug, title: t.title, category: t.category, description: t.description, method: t.method, firstSeenAt: t.firstSeenAt }]));
  for (const topic of topics) catalog.set(topic.slug, topic);
  const trends = computeTrends([...catalog.values()], [...old.trends.flatMap((t) => t.evidence), ...observations], at);
  return pulseSchema.parse({ ...old, version: "v2", trends, hotspots: computeHotspots(trends, at),
    notice: [old.notice, "Scoring updated to v2 using retained evidence; the collection timestamp is unchanged."].filter(Boolean).join(" ") });
}
