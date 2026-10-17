import { type Observation, type Topic, type Trend, type Hotspot, coordinates, sources, sourceTypes, sourceTypeFor } from "@/lib/domain/schema";
import { contentFingerprint, canonicalUrl } from "@/lib/pipeline/normalize";
import { sameSyndicatedContent, syndicationSignature, SyndicationIndex } from "@/lib/pipeline/syndication";

export const HOUR = 3600000;
export const ALGORITHM_VERSION = "v3" as const;
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

// Connected identities prevent bridge duplicates from surviving a greedy filter.
// Earliest publication wins so repeated collection never refreshes a topic's age.
export function deduplicateEvidence(input: readonly Observation[], now: Date): Observation[] {
  const end = now.getTime();
  if (!Number.isFinite(end)) throw new RangeError("Invalid scoring clock");
  const ordered = input.filter((o) => Number.isFinite(Date.parse(o.publishedAt)) && Date.parse(o.publishedAt) <= end)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || compare(a.id, b.id) || compare(a.source, b.source) || compare(a.topicSlug, b.topicSlug) || compare(a.canonicalUrl, b.canonicalUrl) || compare(a.contentHash, b.contentHash) || compare(a.title, b.title) || compare(a.excerpt, b.excerpt) || compare(a.neighborhood ?? "", b.neighborhood ?? ""));
  const parents = ordered.map((_, i) => i), identities = new Map<string, number>();
  const root = (index: number): number => {
    let r = index;
    while (parents[r] !== r) r = parents[r]!;
    while (parents[index] !== index) { const next = parents[index]!; parents[index] = r; index = next; }
    return r;
  };
  for (const [i, o] of ordered.entries()) {
    const keys = [`id:${o.id}`, `source:${o.source}:${o.sourceId}`, `url:${canonicalUrl(o.canonicalUrl)}`,
      `content:${contentFingerprint({ title: o.title, excerpt: o.excerpt, domain: o.domain })}`];
    if (o.contentHash) keys.push(`stored:${o.contentHash}`);
    for (const key of keys) {
      const seen = identities.get(key);
      if (seen === undefined) identities.set(key, i);
      else { const a = root(i), b = root(seen); parents[Math.max(a, b)] = Math.min(a, b); }
    }
  }
  const signatures = ordered.map(syndicationSignature);
  const copyIndex = new SyndicationIndex();
  for (let i = 0; i < ordered.length; i++) {
    for (const j of copyIndex.candidates(signatures[i]!)) if (root(i) !== root(j) && sameSyndicatedContent(signatures[i]!, signatures[j]!)) {
      const a = root(i), b = root(j); parents[Math.max(a, b)] = Math.min(a, b);
    }
    copyIndex.add(signatures[i]!, i);
  }
  const seen = new Set<number>();
  return ordered.filter((_, i) => { const r = root(i); if (seen.has(r)) return false; seen.add(r); return true; });
}

const stop = new Set("the and for with from this that have has are was were into about after before over under through between their your our its not but Bengaluru Bangalore public discussion mentions report reports news update updates example signal signals said says city".toLowerCase().split(" "));
function tokens(o: Observation): Set<string> {
  return new Set([...new Set((`${o.title} ${o.excerpt}`.normalize("NFKC").toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((t) => !stop.has(t)))].slice(0, 32));
}
export function clusterConsistency(evidence: readonly Observation[]): number {
  if (!evidence.length) return 0;
  if (evidence.length === 1) return 0.5;
  const sets = evidence.map(tokens), frequencies = new Map<string, number>();
  for (const words of sets) for (const word of words) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const terms = [...frequencies].filter(([, n]) => n >= Math.max(2, Math.ceil(evidence.length / 3)))
    .sort((a, b) => b[1] - a[1] || compare(a[0], b[0])).slice(0, 3).map(([word]) => word);
  return sets.filter((words) => terms.some((word) => words.has(word))).length / evidence.length;
}

function evaluate(topic: Topic, all: readonly Observation[], now: Date): Trend {
  const end = now.getTime(), recent = all.filter((o) => Date.parse(o.publishedAt) >= end - 24 * HOUR)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || compare(a.id, b.id));
  const window = (hours: number) => recent.filter((o) => Date.parse(o.publishedAt) > end - hours * HOUR);
  const current = window(2), previous = recent.filter((o) => Date.parse(o.publishedAt) > end - 4 * HOUR && Date.parse(o.publishedAt) <= end - 2 * HOUR);
  const c = current.length, p = previous.length, count6h = window(6).length;
  const activeSources = sources.filter((s) => current.some((o) => o.source === s));
  // Two news indexes are one channel, even when they discover different articles.
  // This fixed denominator preserves v2 scores for the original three providers.
  const channels = sourceTypes.filter((type) => activeSources.some((source) => sourceTypeFor[source] === type)), s = channels.length;
  const latestAt = recent[0]?.publishedAt ?? null;
  const age = latestAt ? (end - Date.parse(latestAt)) / HOUR : null;
  const firstTimes = [...all.map((o) => Date.parse(o.publishedAt)), ...(topic.firstSeenAt ? [Date.parse(topic.firstSeenAt)] : [])].filter((t) => Number.isFinite(t) && t <= end);
  const firstTime = firstTimes.length ? firstTimes.reduce((a, b) => Math.min(a, b)) : null;
  const firstSeenAt = firstTime === null ? null : new Date(firstTime).toISOString();
  const growthRatio = (c + 1) / (p + 1);
  const supportedVelocity = clamp(Math.log2(growthRatio) / Math.log2(4)) * c / (c + 3);
  const velocity = p === 0 ? Math.min(0.65, supportedVelocity) : supportedVelocity;
  const volume = clamp(Math.log1p(c) / Math.log(21)), diversity = s / sourceTypes.length;
  const recency = age === null ? 0 : Math.exp(-age / 2);
  const consistency = clusterConsistency(current), evidenceConfidence = 1 - Math.exp(-c / 6);
  const largestShare = c ? Math.max(...channels.map((type) => current.filter((o) => sourceTypeFor[o.source] === type).length / c)) : 0;
  const sourceBalance = s ? clamp(1 - largestShare + 1 / s) : 0;
  let confidence = clamp((0.55 * evidenceConfidence + 0.30 * diversity + 0.15 * consistency) * sourceBalance * (0.5 + 0.5 * consistency));
  if (s === 1) confidence = Math.min(0.45, confidence);
  if (c === 1) confidence = Math.min(0.25, confidence);
  let scoreCap = c === 0 ? 0 : c === 1 ? 20 : 100;
  if (s === 1) scoreCap = Math.min(scoreCap, c < 5 ? 35 : 55);
  if (largestShare > 0.9) scoreCap = Math.min(scoreCap, 55);
  if (consistency < 0.5) scoreCap = Math.min(scoreCap, 60);
  const score = Math.min(scoreCap, Math.round(100 * (0.40 * velocity + 0.25 * volume + 0.20 * diversity + 0.15 * recency)));
  const uncappedChange = 100 * (c - p) / Math.max(p, 3), growthPercent = Math.round(Math.max(-100, Math.min(300, uncappedChange)));
  let lifecycle: Trend["lifecycle"] = "STABLE";
  if ((c === 0 && (all.length > 0 || firstTime !== null)) || (p >= 2 && growthRatio <= 0.75)) lifecycle = "COOLING";
  else if (c > 0 && (c === 1 || firstTime !== null && end - firstTime <= 0.5 * HOUR && count6h <= 3)) lifecycle = "NEW";
  else if (score >= 75 && c >= 6 && s >= 2 && confidence >= 0.65 && consistency >= 0.5 && growthRatio >= 1.5 && age !== null && age <= 0.5) lifecycle = "HOT";
  else if (p === 0 && c >= 2) lifecycle = "EMERGING";
  else if (growthRatio >= 1.25 && c - p >= 2 && score >= 45 && s >= 2 && confidence >= 0.35) lifecycle = "RISING";
  const history = Array.from({ length: 24 }, (_, i) => {
    const start = end - (24 - i) * HOUR;
    return { at: new Date(start).toISOString(), count: recent.filter((o) => {
      const t = Date.parse(o.publishedAt); return (i === 0 ? t >= start : t > start) && t <= start + HOUR;
    }).length };
  });
  return { ...topic, current2h: c, previous2h: p, count6h, count24h: recent.length, sourceCount: activeSources.length,
    currentCount: c, baselineCount: p, totalCount: recent.length, growthRatio, growthPercent, changeCapped: uncappedChange > 300,
    velocity, volume, diversity, recency, score, scoreCap, confidence, clusterConsistency: consistency, evidenceConfidence,
    diversityConfidence: diversity, sourceBalance, confidenceLabel: confidence >= 0.7 ? "high" : confidence >= 0.35 ? "medium" : "low",
    lifecycle, latestAt, latestSignalAgeHours: age, firstSeenAt, history, evidence: recent, sources: activeSources,
    explanation: `${c} distinct signals in the last 2 hours, compared with ${p} in the previous 2 hours, across ${activeSources.length} public ${activeSources.length === 1 ? "source" : "sources"} and ${s} evidence ${s === 1 ? "channel" : "channels"}.${scoreCap < 100 ? ` Evidence safeguards cap the score at ${scoreCap}.` : ""}` };
}

export function evaluateTopics(topics: readonly Topic[], observations: readonly Observation[], now: Date): Trend[] {
  const grouped = new Map<string, Observation[]>();
  for (const o of deduplicateEvidence(observations, now)) {
    const group = grouped.get(o.topicSlug) ?? []; group.push(o); grouped.set(o.topicSlug, group);
  }
  return topics.map((topic) => evaluate(topic, grouped.get(topic.slug) ?? [], now));
}
export function computeTrends(topics: readonly Topic[], observations: readonly Observation[], now: Date): Trend[] {
  return evaluateTopics(topics, observations, now).filter((t) => t.current2h >= 2)
    .sort((a, b) => b.score - a.score || b.velocity - a.velocity || compare(a.slug, b.slug));
}
export function computeHotspots(trends: readonly Trend[], now: Date): Hotspot[] {
  const map = new Map<string, Hotspot>();
  for (const o of deduplicateEvidence(trends.flatMap((t) => t.evidence), now)) {
    if (!o.neighborhood || Date.parse(o.publishedAt) <= now.getTime() - 2 * HOUR) continue;
    const location = o.neighborhood;
    const center = coordinates[location];
    if (!center) continue;
    const point = map.get(location) ?? { neighborhood: location, lat: center[0], lng: center[1], count: 0, topics: [] };
    point.count++;
    if (!point.topics.includes(o.topicSlug)) point.topics.push(o.topicSlug);
    map.set(location, point);
  }
  return [...map.values()].map((h) => ({ ...h, topics: [...h.topics].sort(compare) })).sort((a, b) => b.count - a.count || compare(a.neighborhood, b.neighborhood));
}

export { formatChange } from "./presentation";
