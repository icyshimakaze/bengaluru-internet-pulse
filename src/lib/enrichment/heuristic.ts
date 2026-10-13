import "server-only";
import { createHash } from "node:crypto";
import { neighborhoods, type Signal } from "@/lib/domain/schema";
import type { EnrichmentResult, EnrichmentTopic } from "@/lib/domain/enrichment";
import type { EnrichmentProvider } from "./types";
import { validateBatch } from "./validation";

const stopWords = new Set(`a an the in on at for and or of to is are was were be been with from this that it as by
  bengaluru bangalore bengalooru namma public mentions mention discussion discussions report reports reported update updates
  says said new after city about has have will not more its their our your today latest`.split(/\s+/u));
const synonyms: Readonly<Record<string, string>> = {
  bmrcl: "metro", metros: "metro", delayed: "delay", delays: "delay", delaying: "delay",
  trains: "train", services: "service", rains: "rain", rainfall: "rain", flooded: "flood", flooding: "flood",
  waterlogged: "waterlogging", startups: "startup", cafes: "cafe", cafés: "cafe", café: "cafe",
  restaurants: "restaurant", concerts: "concert", festivals: "festival", closures: "closure", closed: "closure",
};
export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/https?:\/\/\S+/gu, " ").replace(/\s+/gu, " ").trim();
}
export function extractKeywords(value: string): string[] {
  const words = normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => !stopWords.has(w) && (w.length >= 3 || /^\d+$/u.test(w)))
    .map((w) => synonyms[w] ?? w))];
}
export function tokenOverlap(a: string[], b: string[]): number {
  const left = new Set(a), right = new Set(b);
  const intersection = [...left].filter((t) => right.has(t)).length;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
}
function mentionedNeighborhoods(text: string) {
  const normalized = normalizeText(text);
  return neighborhoods.filter((area) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${area.toLowerCase()}(?:$|[^\\p{L}\\p{N}])`, "u").test(normalized));
}
export function detectBengaluru(text: string): boolean {
  return /\b(bengaluru|bangalore|bengalooru|bmrcl|bbmp|bwssb|bescom|namma\s+metro|kempegowda)\b|ಬೆಂಗಳೂರು/iu.test(text)
    || mentionedNeighborhoods(text).length > 0;
}
const categoryRules: Array<[EnrichmentResult["category"], RegExp]> = [
  ["weather", /\b(rain\w*|flood\w*|waterlog\w*|monsoon|weather|storm\w*)\b/iu],
  ["traffic", /\b(metro|bmrcl|traffic|commut\w*|road|airport|congestion|pothole\w*)\b/iu],
  ["business", /\b(funding|venture|business|investment|acquisition|revenue|ipo|finance)\b/iu],
  ["technology", /\b(ai|startup\w*|artificial intelligence|software|technology|developer\w*|hackathon)\b/iu],
  ["sports", /\b(cricket|football|sports|ipl|rcb|match|stadium|marathon)\b/iu],
  ["events", /\b(concert\w*|festival\w*|conference|meetup|event\w*|gig)\b/iu],
  ["culture", /\b(music|exhibition|theatre|theater|art|museum|heritage|dance)\b/iu],
  ["food", /\b(caf[eé]\w*|restaurant\w*|coffee|food|dosa|dining)\b/iu],
  ["civic", /\b(bbmp|bwssb|bescom|water supply|water shortage|garbage|waste|power cut|municipal)\b/iu],
];
export function classifyCategory(text: string): EnrichmentResult["category"] {
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}
const eventTerms = new Set(["delay", "closure", "outage", "strike", "extension", "launch", "funding", "festival", "concert", "flood", "rain", "shortage", "accident", "protest"]);
export function topicSimilarity(title: string, label: string): number {
  const a = extractKeywords(title), b = extractKeywords(label);
  if (!a.length || !b.length) return 0;
  const anchors = (words: string[]) => words.filter((w) => /^\d+$/u.test(w) || eventTerms.has(w)).sort().join("|");
  if (anchors(a) !== anchors(b)) return 0;
  const areasA = mentionedNeighborhoods(title), areasB = mentionedNeighborhoods(label);
  if (areasA.length && areasB.length && areasA.join("|") !== areasB.join("|")) return 0;
  return tokenOverlap(a, b);
}
function factualSummary(signal: Signal): string {
  const fragment = signal.title.split(/[<>\x00-\x1f]/u).find((part) => part.trim().length >= 3) ?? signal.excerpt.split(/[<>\x00-\x1f]/u).find((part) => part.trim().length >= 3) ?? "";
  return `Public mentions: ${fragment.trim().split(/\s+/u).slice(0, 22).join(" ").slice(0, 260).trim()}`;
}
function proposal(signal: Signal, category: EnrichmentResult["category"]) {
  const words = signal.title.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const labelWords = words.filter((w) => !stopWords.has(w.toLowerCase()) && (w.length >= 3 || /^\d+$/u.test(w)));
  const canonical_label = (labelWords.slice(0, 9).join(" ") || "Bengaluru discussion").slice(0, 100).trim();
  const ascii = extractKeywords(canonical_label).join("-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-$/g, "");
  // Include the full normalized keyword identity so truncated labels cannot merge distinct events.
  const digest = createHash("sha256").update(`${category}:${extractKeywords(signal.title).sort().join("|")}`).digest("hex").slice(0, 16);
  const slug = `${(ascii || "bengaluru").slice(0, 75).replace(/-$/g, "")}-${digest}`;
  return { canonical_label: canonical_label.length < 3 ? "Bengaluru discussion" : canonical_label, slug, category };
}

export class HeuristicEnrichmentProvider implements EnrichmentProvider {
  readonly name = "heuristic" as const;
  readonly model = null;
  async enrich(signals: Signal[], catalog: EnrichmentTopic[], _context: { signal: AbortSignal }): Promise<EnrichmentResult[]> {
    void _context; // Local fallback still works after the network deadline expires.
    const proposals: Array<EnrichmentResult["new_topic"]> = [];
    const items = signals.map((signal): EnrichmentResult => {
      const text = `${signal.title} ${signal.excerpt.slice(0, 1000)}`;
      const relevant = detectBengaluru(text), category = classifyCategory(text);
      const areas = mentionedNeighborhoods(text);
      const ranked = catalog.filter((topic) => topic.category === category || category === "other")
        .map((topic) => ({ topic, similarity: topicSimilarity(signal.title, topic.canonical_label) }))
        .filter((match) => match.similarity >= 0.75)
        .sort((a, b) => b.similarity - a.similarity || a.topic.id.localeCompare(b.topic.id));
      const existing = ranked[0] && (!ranked[1] || ranked[0].similarity > ranked[1].similarity) ? ranked[0].topic : undefined;
      const equivalent = proposals.find((topic) => topic && topic.category === category && topicSimilarity(signal.title, topic.canonical_label) >= 0.75);
      const created = equivalent ?? proposal(signal, category);
      if (!existing && !equivalent) proposals.push(created);
      const target = existing ?? created;
      const keywords = extractKeywords(signal.title);
      return { signal_id: signal.id, existing_topic_id: existing?.id ?? null, new_topic: existing ? null : created,
        canonical_label: target.canonical_label, slug: target.slug, category: target.category,
        neighborhood: areas.length === 1 ? areas[0]! : relevant && !areas.length ? "Citywide" : "Unknown",
        local_relevance: relevant ? 1 : 0, summary: factualSummary(signal),
        confidence: !relevant ? 0.9 : existing ? 0.85 : keywords.some((word) => /\p{L}/u.test(word)) ? 0.7 : 0.4 };
    });
    return validateBatch({ items }, signals, catalog);
  }
}
