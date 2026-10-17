import "server-only";
import { createHash } from "node:crypto";
import { type Signal } from "@/lib/domain/schema";
import type { EnrichmentResult, EnrichmentTopic } from "@/lib/domain/enrichment";
import type { EnrichmentProvider } from "./types";
import { validateBatch } from "./validation";
import { factualSummary } from "./summary";
import { normalizeText, extractKeywords, tokenOverlap, eventIdentity, eventAnchors, conflictingEvents, namedEventIdentity, dateAnchors, fundingAmount, jobIdentity, cricketIdentity } from "@/lib/pipeline/matching";
import { filterSignal } from "@/lib/ingestion/filters.config";
import { mentionedNeighborhoods, detectBengaluru } from "@/lib/pipeline/location";
export { normalizeText, extractKeywords, tokenOverlap } from "@/lib/pipeline/matching";
export { detectBengaluru } from "@/lib/pipeline/location";

const stopWords = new Set(`a an the in on at for and or of to is are was were be been with from this that it as by
  bengaluru bangalore bengalooru namma public mentions mention discussion discussions report reports reported update updates
  says said new after city about has have will not more its their our your today latest`.split(/\s+/u));
const categoryRules: Array<[EnrichmentResult["category"], RegExp]> = [
  ["food", /\b(caf[eé]\w*|restaurant\w*|coffee|food|dosa|dining|pizza|sushi|curated menu)\b/iu],
  ["sports", /\b(cricket|t20i?|odi|football|sports|ipl|rcb|match|stadium|marathon)\b/iu],
  ["events", /\b(concert\w*|festival\w*|conference|meetup|event\w*|gig)\b/iu],
  ["culture", /\b(music|exhibition|theatre|theater|art|museum|heritage|dance)\b/iu],
  ["weather", /\b(rain\w*|flood\w*|waterlog\w*|monsoon|weather|storm\w*)\b/iu],
  ["civic", /\b(bbmp|bwssb|bescom|water supply|water shortage|water cut|no water|garbage|waste|power cut|municipal|sewage|drainage|council|ward committee)\b/iu],
  ["traffic", /\b(metro|bmrcl|traffic|commut\w*|airport(?!\s+road)|congestion|pothole\w*|road\s+(closure|works|accident|safety|repair))\b/iu],
  ["business", /\b(funding|ventures?|business|investment|acquisition|revenue|ipo|finance|economy|retail|commercial|raised?\s+\$)\b/iu],
  ["technology", /\b(ai|startup\w*|artificial intelligence|software|technology|developers?|hackathon|quantum)\b/iu],
];
const localEventKey = (title: string) => namedEventIdentity(title)?.key
  ?? (cricketIdentity(title) ? `${JSON.stringify(cricketIdentity(title))}:${dateAnchors(title).join("|")}` : undefined);
export function classifyCategory(text: string): EnrichmentResult["category"] {
  if (filterSignal({ title: text, excerpt: text }) === "job_posting") return "jobs";
  const subject = normalizeText(text).split(/📍|🏠|\bvenue:|\blocation:/u)[0]!;
  return categoryRules.find(([, pattern]) => pattern.test(subject))?.[0] ?? "other";
}
export function topicSimilarity(title: string, label: string): number {
  const a = extractKeywords(title), b = extractKeywords(label);
  if (!a.length || !b.length) return 0;
  const jobA = jobIdentity(title), jobB = jobIdentity(label);
  if (jobA || jobB) return jobA && jobB && jobA.role === jobB.role && jobA.id !== null && jobA.id === jobB.id ? 0.95 : 0;
  if (conflictingEvents(title, label)) return 0;
  const areasA = mentionedNeighborhoods(title), areasB = mentionedNeighborhoods(label);
  if (areasA.length && areasB.length && areasA.join("|") !== areasB.join("|")) return 0;
  const cricketA = cricketIdentity(title), cricketB = cricketIdentity(label);
  if (cricketA && cricketB) return cricketA.teams === cricketB.teams && cricketA.format === cricketB.format
    && cricketA.action === cricketB.action && cricketA.women === cricketB.women ? 0.9 + 0.1 * tokenOverlap(a, b) : 0;
  const namedA = namedEventIdentity(title), namedB = namedEventIdentity(label);
  if (namedA?.key.startsWith("funding:") && fundingAmount(title) !== null && fundingAmount(label) !== null && fundingAmount(title) !== fundingAmount(label)) return 0;
  if (namedA && namedB && namedA.key === namedB.key) return 0.9 + 0.1 * tokenOverlap(a, b);
  // Canonical named-event labels retain the subject even after punctuation is removed.
  if (namedA && extractKeywords(namedA.label).every((word) => b.includes(word)) && eventAnchors(title).join("|") === eventAnchors(label).join("|")) return 0.9;
  const eventA = eventIdentity(title), eventB = eventIdentity(label);
  if (eventA && eventB && eventA.kind === eventB.kind && eventA.action === eventB.action) {
    // Require a shared route or explicit place: a generic city-wide metro delay
    // cannot absorb every incident. Causes and explicit dates remain guards.
    const route = eventA.route.some((r) => eventB.route.includes(r));
    const place = areasA.length > 0 && areasA.join("|") === areasB.join("|");
    if (route || place) return 0.9 + 0.1 * tokenOverlap(a, b);
  }
  if (eventAnchors(title).join("|") !== eventAnchors(label).join("|")) return 0;
  const numbers = (words: string[]) => words.filter((w) => /^\d+$/u.test(w)).sort().join("|");
  if (numbers(a) !== numbers(b)) return 0;
  return tokenOverlap(a, b);
}
function proposal(signal: Signal, category: EnrichmentResult["category"]) {
  const words = normalizeText(signal.title).match(/[\p{L}\p{N}]+/gu) ?? [];
  const labelWords = words.filter((w) => !stopWords.has(w.toLowerCase()) && (w.length >= 3 || /^\d+$/u.test(w)));
  const event = eventIdentity(signal.title), areas = mentionedNeighborhoods(signal.title);
  const named = namedEventIdentity(signal.title);
  const job = jobIdentity(signal.title);
  const amount = named?.key.startsWith("funding:") ? signal.title.match(/\$\s*\d+(?:\.\d+)?\s*(?:million|billion|m|b)?\b/iu)?.[0] : undefined;
  const dates = signal.title.match(/\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}|\d{4}-\d{2}-\d{2})\b/giu) ?? [];
  const anchored = event && (event.route.length > 0 || areas.length > 0);
  const cricket = cricketIdentity(signal.title);
  const cricketLabel = cricket ? [...cricket.teams.split(":").map((team) => team.replaceAll("-", " ")),
    ...(cricket.women ? ["women"] : []), cricket.format, cricket.action, ...dates].join(" ") : null;
  const eventLabel = anchored ? [event.kind === "metro" ? "Metro" : "Water supply", event.action,
    ...event.route.map((route) => `${route.charAt(0).toUpperCase()}${route.slice(1)} Line`), ...areas, ...event.causes, ...dates].join(" ") : null;
  const canonical_label = (job?.id ? `${job.role.slice(0, 75)} Job ${job.id}` : named ? [named.label, amount, ...dates].filter(Boolean).join(" ") : cricketLabel ?? eventLabel ?? (labelWords.slice(0, 9).join(" ") || "Bengaluru discussion")).slice(0, 100).trim();
  const ascii = extractKeywords(canonical_label).join("-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-$/g, "");
  // Include the full normalized keyword identity so truncated labels cannot merge distinct events.
  const identity = named ? `${named.key}:${fundingAmount(signal.title) ?? ""}:${dateAnchors(signal.title).join("|")}` : extractKeywords(anchored ? canonical_label : signal.title).sort().join("|");
  const bucket = cricketIdentity(signal.title) ? `:${Math.floor(Date.parse(signal.publishedAt) / (12 * 3600000))}` : "";
  const digest = createHash("sha256").update(`${category}:${identity}${bucket}`).digest("hex").slice(0, 16);
  const slug = `${(ascii || "bengaluru").slice(0, 75).replace(/-$/g, "")}-${digest}`;
  return { canonical_label: canonical_label.length < 3 ? "Bengaluru discussion" : canonical_label, slug, category };
}

export class HeuristicEnrichmentProvider implements EnrichmentProvider {
  readonly name = "heuristic" as const;
  readonly model = null;
  async enrich(signals: Signal[], catalog: EnrichmentTopic[], _context: { signal: AbortSignal }): Promise<EnrichmentResult[]> {
    void _context; // Local fallback still works after the network deadline expires.
    const proposals: Array<EnrichmentResult["new_topic"]> = [];
    const proposalTimes = new Map<string, number>();
    const localNamedKeys = new Set(signals.filter((s) => detectBengaluru(`${s.title} ${s.excerpt}`)).map((s) => localEventKey(s.title)).filter(Boolean));
    const ordered = [...signals].sort((a, b) => Number(fundingAmount(b.title) !== null) - Number(fundingAmount(a.title) !== null)
      || Number(detectBengaluru(`${b.title} ${b.excerpt}`)) - Number(detectBengaluru(`${a.title} ${a.excerpt}`))
      || a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
    const items = ordered.map((signal): EnrichmentResult => {
      const subject = extractKeywords(signal.title).length === 0 && /\b(?:https?:\/\/|www\.)/iu.test(signal.title) ? { ...signal, title: signal.excerpt.slice(0, 300) } : signal;
      const text = `${signal.title} ${signal.excerpt.slice(0, 1000)}`;
      const directRelevance = detectBengaluru(text), category = classifyCategory(text);
      const areas = mentionedNeighborhoods(text);
      const ranked = catalog.filter((topic) => topic.category === category || category === "other")
        .map((topic) => ({ topic, similarity: topicSimilarity(subject.title, topic.canonical_label) }))
        .filter((match) => match.similarity >= 0.75)
        .sort((a, b) => b.similarity - a.similarity || a.topic.id.localeCompare(b.topic.id));
      const existing = ranked[0] && (!ranked[1] || ranked[0].similarity > ranked[1].similarity) ? ranked[0].topic : undefined;
      const equivalent = proposals.find((topic) => topic && topic.category === category && topicSimilarity(subject.title, topic.canonical_label) >= 0.75
        && (!cricketIdentity(subject.title) || Math.abs(Date.parse(signal.publishedAt) - (proposalTimes.get(topic.slug) ?? 0)) <= 12 * 3600000));
      // A distinctive named event can inherit city relevance from supplied local
      // catalog evidence; a generic subject or foreign-city event cannot.
      const knownEvent = localEventKey(subject.title) && (existing && ranked[0]!.similarity >= 0.9 || equivalent && topicSimilarity(subject.title, equivalent.canonical_label) >= 0.9);
      const relevant = directRelevance || (Boolean(knownEvent) || localNamedKeys.has(localEventKey(subject.title))) && !/\b(delhi|mumbai|chennai|hyderabad|pune|gurugram|gurgaon|kochi|kolkata|manchester|london)\b/iu.test(normalizeText(text));
      const created = equivalent ?? proposal(subject, category);
      if (relevant && !existing && !equivalent) { proposals.push(created); proposalTimes.set(created.slug, Date.parse(signal.publishedAt)); }
      const target = existing ?? created;
      const keywords = extractKeywords(subject.title);
      return { signal_id: signal.id, existing_topic_id: existing?.id ?? null, new_topic: existing ? null : created,
        canonical_label: target.canonical_label, slug: target.slug, category: target.category,
        neighborhood: areas.length === 1 ? areas[0]! : relevant && !areas.length ? "Citywide" : "Unknown",
        local_relevance: relevant ? 1 : 0, summary: factualSummary(signal),
        confidence: !relevant ? 0.9 : existing ? 0.85 : keywords.some((word) => /\p{L}/u.test(word)) ? 0.7 : 0.4 };
    });
    const byId = new Map(validateBatch({ items }, signals, catalog).map((item) => [item.signal_id, item]));
    return signals.map((signal) => byId.get(signal.id)!);
  }
}
