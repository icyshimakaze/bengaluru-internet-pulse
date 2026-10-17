import type { HistorySnapshot, LocationEvidence, PublicSignal, PublicTopic } from "@/lib/domain/read-models";
import { locationEvidenceSchema } from "@/lib/domain/read-models";

/** A literal source headline with link/attribution noise removed, never a generated claim. */
export function evidenceHeadline(value: string): string | null {
  const cleaned = value.replace(/\b(?:https?:\/\/|www\.)\S+/giu, " ")
    .split(/\b(?:original\s+post|source)\s*:/iu)[0]!
    .replace(/#[\p{L}\p{N}_]+/gu, " ").replace(/\s+/gu, " ").trim();
  if ((cleaned.match(/\p{L}/gu) ?? []).length < 3) return null;
  if (cleaned.length <= 100) return cleaned;
  const prefix = cleaned.slice(0, 97), boundary = prefix.lastIndexOf(" ");
  return (boundary >= 60 ? prefix.slice(0, boundary) : prefix).trimEnd() + "…";
}

export type TopicEvidenceLink = Pick<PublicSignal, "id" | "source" | "sourceType" | "url" | "title" | "domain" | "publishedAt" | "timeKind">;
/** Serialize only the provenance displayed by interactive evidence cards. */
export function evidenceLinks(signals: readonly PublicSignal[]): TopicEvidenceLink[] {
  return signals.map(({ id, source, sourceType, url, title, domain, publishedAt, timeKind }) =>
    ({ id, source, sourceType, url, title, domain, publishedAt, timeKind }));
}

/** Describes observed counts, never why an event happened or whether it is true. */
export function evidenceExplanation(topic: Pick<PublicTopic, "current2h" | "previous2h" | "sourceCount">): string {
  const { current2h: current, previous2h: previous, sourceCount } = topic;
  if (!current) return "No distinct signals were observed in the latest two hours. This topic remains in the archive; its earlier attention is visible in recorded snapshots.";
  const sources = sourceCount + " public source " + (sourceCount === 1 ? "provider" : "providers");
  const observations = current + (current === 1 ? " distinct signal was observed" : " distinct signals were observed");
  if (!previous) return observations + " in the latest two hours across " + sources + ". The previous window had none, so the engine moderates growth without an established baseline.";
  if (current > previous) return "Distinct mentions increased from " + previous + " to " + current + " between successive two-hour windows, spanning " + sources + ".";
  if (current < previous) return "Distinct mentions decreased from " + previous + " in the previous two hours to " + current + " in the latest two hours, across " + sources + ". Attention is cooling rather than accelerating.";
  return observations + " in each of the two successive windows, across " + sources + ". Volume is steady; the score also reflects diversity and recency.";
}

/** Input must be canonical, deduplicated 24-hour evidence from the server projection. */
export function supportedLocation(evidence: readonly Pick<PublicSignal, "neighborhood" | "source">[]): LocationEvidence {
  const located = evidence.filter((s) => s.neighborhood);
  const groups = new Map<NonNullable<PublicSignal["neighborhood"]>, { count: number; sources: Set<PublicSignal["source"]> }>();
  for (const signal of located) {
    const name = signal.neighborhood!;
    const group = groups.get(name) ?? { count: 0, sources: new Set<PublicSignal["source"]>() };
    group.count++; group.sources.add(signal.source); groups.set(name, group);
  }
  const lead = [...groups].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))[0];
  const mentionCount = lead?.[1].count ?? 0, sourceCount = lead?.[1].sources.size ?? 0;
  const share = located.length ? mentionCount / located.length : 0;
  const status = !located.length ? "unknown" : share < 0.6 ? "mixed" : mentionCount < 2 || sourceCount < 2 ? "insufficient" : "supported";
  return locationEvidenceSchema.parse({ status, neighborhood: status === "supported" ? lead![0] : null,
    mentionCount, locatedSignalCount: located.length, sourceCount });
}
export function observedMilestones(history: readonly HistorySnapshot[]) {
  // Versions have different score equations. Never combine them to invent a peak or stage.
  const current = history.filter((s) => s.algorithmVersion === "v2").sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return {
    emerging: current.find((s) => s.lifecycle === "EMERGING") ?? null,
    rising: current.find((s) => s.lifecycle === "RISING") ?? null,
    peak: current.filter((s) => s.count24h > 0).reduce<HistorySnapshot | null>((peak, row) => !peak || row.pulseScore > peak.pulseScore ? row : peak, null),
  };
}
