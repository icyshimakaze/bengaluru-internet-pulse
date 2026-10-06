import { topicSchema, type Topic, type Signal } from "@/lib/domain/schema";
import { isBengaluruRelevant, locate } from "./normalize";

export const topicRules: Array<Topic & { pattern: RegExp }> = [
  { slug: "namma-metro", title: "Namma Metro", category: "Mobility", description: "Discussion of Bengaluru's metro network, services and expansion.", method: "rules", pattern: /\b(metro|bmrcl|purple line|yellow line|pink line)\b/i },
  { slug: "rain-and-waterlogging", title: "Rain & waterlogging", category: "Weather", description: "Public mentions of Bengaluru rain, flooding and waterlogged roads.", method: "rules", pattern: /\b(rain|rains|rainfall|flood|flooding|waterlog\w*|monsoon)\b/i },
  { slug: "traffic-and-commutes", title: "Traffic & commutes", category: "Mobility", description: "Public discussion of traffic, road closures and journeys across the city.", method: "rules", pattern: /\b(traffic|congestion|commut\w*|pothole\w*|road closure)\b/i },
  { slug: "startup-ecosystem", title: "The startup ecosystem", category: "Technology", description: "Bengaluru conversations about startups, technology and funding.", method: "rules", pattern: /\b(startup\w*|funding|venture|hackathon|artificial intelligence|tech\w*|software)\b/i },
  { slug: "water-supply", title: "Water supply", category: "Civic", description: "Mentions of Bengaluru's water supply, shortages and infrastructure.", method: "rules", pattern: /\b(water supply|water crisis|water shortage|bwssb|tanker\w*)\b/i },
  { slug: "food-and-cafes", title: "Food & cafés", category: "City life", description: "Public discussion of food, cafés and restaurants in Bengaluru.", method: "rules", pattern: /\b(cafe\w*|café\w*|restaurant\w*|coffee|food|dosa)\b/i },
  { slug: "arts-and-events", title: "Arts & events", category: "City life", description: "Bengaluru conversations about performances, festivals and public events.", method: "rules", pattern: /\b(concert\w*|festival\w*|music|exhibition|theatre|theater|gig)\b/i },
  { slug: "civic-infrastructure", title: "Civic infrastructure", category: "Civic", description: "Public discussion of Bengaluru's municipal services and infrastructure.", method: "rules", pattern: /\b(bbmp|garbage|waste|power cut|bescom|municipal)\b/i },
];
const stop = new Set("the a an in on at for and of to is are was with from this that it as by bengaluru bangalore says said new after city about has have will not more its their our your public update".split(" "));
function tokens(value: string) { return [...new Set(value.toLowerCase().match(/[a-z]{3,}/g) ?? [])].filter((t) => !stop.has(t)); }
export function classifyLocal(signal: Signal, catalog: Topic[]) {
  if (!isBengaluruRelevant(signal.text)) return null;
  const rule = topicRules.find((r) => r.pattern.test(signal.text));
  if (rule) { const { pattern: _pattern, ...topic } = rule; void _pattern; return { topic, neighborhood: locate(signal.text) }; }
  const words = tokens(signal.title);
  if (words.length < 2) return null;
  const existing = catalog.find((t) => {
    const other = tokens(t.title);
    const matches = other.filter((w) => words.includes(w)).length;
    return matches >= 2 && matches / new Set([...words, ...other]).size >= 0.45;
  });
  const label = words.slice(0, 5).join(" ").slice(0, 90).trim();
  const result = topicSchema.safeParse(existing ?? { slug: words.slice(0, 5).join("-").slice(0, 90).replace(/-$/, ""), title: label.charAt(0).toUpperCase() + label.slice(1), category: "City life", description: `Public Bengaluru mentions of ${label}.`, method: "rules" });
  return result.success ? { topic: result.data, neighborhood: locate(signal.text) } : null;
}
