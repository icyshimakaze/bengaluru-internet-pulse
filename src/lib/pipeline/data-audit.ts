import "server-only";
import type { Client, Row } from "@libsql/client";
import { z } from "zod";
import { itemFromRow, topicFromRow, runFromRow, toObservations, toDomainTopic } from "@/lib/db/mapping";
import { editorialCategory } from "@/lib/domain/enrichment";
import { storedPulseSchema } from "@/lib/domain/schema";
import { classifyCategory, topicSimilarity } from "@/lib/enrichment/heuristic";
import { canonicalUrl } from "./normalize";
import { normalizeText, conflictingEvents } from "./matching";
import { detectBengaluru, mentionedNeighborhoods } from "./location";
import { sameSyndicatedContent, syndicationSignature } from "./syndication";
import { evaluateTopics } from "@/lib/trends/engine";

const ids = z.array(z.string());
const pair = z.object({ left: z.string(), right: z.string() });
export const dataAuditSchema = z.object({
  inspectedAt: z.iso.datetime(), mode: z.literal("live"), sampled: z.boolean(), itemCount: z.number().int().nonnegative(), topicCount: z.number().int().nonnegative(),
  inspectedItems: z.number().int().nonnegative(), inspectedTopics: z.number().int().nonnegative(),
  invalidRecords: z.array(z.object({ table: z.string(), id: z.string() })), futureTimestamps: ids,
  outside2h: z.number().int().nonnegative(), outside24h: z.number().int().nonnegative(), outsideRetention: ids,
  duplicateUrls: z.array(z.object({ url: z.string(), items: ids })), syndicatedCopies: z.array(pair), duplicateTopics: z.array(pair),
  mergeCandidates: z.array(pair), conflictingAssignments: z.array(pair), relevanceReview: ids, neighborhoodReview: ids,
  categoryReview: z.array(z.object({ id: z.string(), stored: z.string(), suggested: z.string() })),
  badSourceLinks: ids, emptySummaries: ids, scoreMismatches: ids, oneSourceTopics: ids,
  latestSnapshot: z.iso.datetime().nullable(), staleSnapshot: z.boolean(),
  sourceRuns: z.array(z.object({ source: z.string(), startedAt: z.iso.datetime(), status: z.string(), inserted: z.number(), errors: z.number(), error: z.string().nullable() })),
});
export type DataAudit = z.infer<typeof dataAuditSchema>;

// Read-only and bounded. Review candidates are evidence for inspection, not automatic repairs.
export async function auditStoredData(client: Client, now: Date): Promise<DataAudit> {
  z.date().parse(now);
  const result = await client.batch([
    "SELECT count(*) AS count FROM items WHERE is_fixture=0",
    "SELECT count(*) AS count FROM topics WHERE is_fixture=0",
    "SELECT * FROM items WHERE is_fixture=0 ORDER BY collected_at DESC,id LIMIT 2000",
    "SELECT * FROM topics WHERE is_fixture=0 ORDER BY last_seen_at DESC,id LIMIT 1000",
    "SELECT * FROM ingestion_runs WHERE is_fixture=0 ORDER BY started_at DESC,id LIMIT 30",
    "SELECT payload FROM pulse_snapshots WHERE mode='live' ORDER BY captured_at DESC,rowid DESC LIMIT 1",
    "SELECT item_id,payload FROM item_enrichments ORDER BY enriched_at DESC,item_id LIMIT 2000",
  ], "read");
  const invalidRecords: DataAudit["invalidRecords"] = [];
  function validated<T>(rows: Row[], table: string, parse: (row: Row) => T): T[] {
    return rows.flatMap((row) => { try { return [parse(row)]; } catch { invalidRecords.push({ table, id: String(row.id ?? row.item_id ?? "snapshot") }); return []; } });
  }
  const rawItems = result[2]!.rows, rawTopics = result[3]!.rows;
  const items = validated(rawItems, "items", itemFromRow), topics = validated(rawTopics, "topics", topicFromRow);
  const runs = validated(result[4]!.rows, "ingestion_runs", runFromRow);
  const urls = new Map<string, string[]>(), badSourceLinks: string[] = [], emptySummaries: string[] = [];
  for (const item of items) {
    try {
      const url = canonicalUrl(item.canonicalUrl); canonicalUrl(item.originalUrl);
      urls.set(url, [...(urls.get(url) ?? []), item.id]);
      const original = new URL(item.originalUrl);
      if (item.source === "bluesky" && (original.hostname !== "bsky.app" || !/^\/profile\/[^/]+\/post\/[^/]+$/u.test(original.pathname)) ||
          item.source === "hackernews" && (original.hostname !== "news.ycombinator.com" || !/^\d+$/u.test(original.searchParams.get("id") ?? ""))) badSourceLinks.push(item.id);
    } catch { badSourceLinks.push(item.id); }
  }
  const duplicateTopics: DataAudit["duplicateTopics"] = [], mergeCandidates: DataAudit["mergeCandidates"] = [];
  for (let i = 0; i < topics.length; i++) for (let j = 0; j < i; j++) {
    const a = topics[i]!, b = topics[j]!;
    if (normalizeText(a.canonicalLabel) === normalizeText(b.canonicalLabel)) duplicateTopics.push({ left: a.id, right: b.id });
    else if (a.category === b.category && topicSimilarity(a.canonicalLabel, b.canonicalLabel) >= 0.75) mergeCandidates.push({ left: a.id, right: b.id });
  }
  const signatures = items.map((item) => syndicationSignature({ ...item, excerpt: item.excerpt }));
  const syndicatedCopies: DataAudit["syndicatedCopies"] = [], conflictingAssignments: DataAudit["conflictingAssignments"] = [];
  for (let i = 0; i < items.length; i++) for (let j = 0; j < i; j++) {
    const a = items[i]!, b = items[j]!;
    if (sameSyndicatedContent(signatures[i]!, signatures[j]!)) syndicatedCopies.push({ left: a.id, right: b.id });
    if (a.topicId && a.topicId === b.topicId && conflictingEvents(a.title, b.title)) conflictingAssignments.push({ left: a.id, right: b.id });
  }
  const relevanceReview = items.filter((item) => item.enrichmentStatus === "completed" && !detectBengaluru(`${item.title} ${item.excerpt}`)).map((item) => item.id);
  const neighborhoodReview = items.filter((item) => { const areas = mentionedNeighborhoods(`${item.title} ${item.excerpt}`); return item.neighborhood !== null && (areas.length !== 1 || areas[0] !== item.neighborhood); }).map((item) => item.id);
  const categoryReview = items.flatMap((item) => {
    const suggested = editorialCategory[classifyCategory(`${item.title} ${item.excerpt}`)];
    return item.category && suggested !== item.category ? [{ id: item.id, stored: item.category, suggested }] : [];
  });
  for (const row of rawTopics) if (!String(row.summary ?? "").trim()) emptySummaries.push(String(row.id));
  const liveIds = new Set(rawItems.map((r) => String(r.id)));
  for (const row of result[6]!.rows) if (liveIds.has(String(row.item_id))) {
    try { const payload = z.object({ summary: z.string().trim().min(3) }).parse(JSON.parse(String(row.payload))); void payload; }
    catch { emptySummaries.push(String(row.item_id)); }
  }
  let snapshot: z.infer<typeof storedPulseSchema> | null = null;
  if (result[5]!.rows[0]) try { snapshot = storedPulseSchema.parse(JSON.parse(String(result[5]!.rows[0].payload))); }
  catch { invalidRecords.push({ table: "pulse_snapshots", id: "latest" }); }
  const at = snapshot?.generatedAt ?? null;
  const metrics = at ? evaluateTopics(topics.map(toDomainTopic), toObservations(items, topics), new Date(at)) : [];
  const scoreMismatches = snapshot?.version === "v2" ? snapshot.trends.filter((trend) => {
    const metric = metrics.find((m) => m.slug === trend.slug);
    return !metric || metric.score !== trend.score || metric.current2h !== trend.current2h || trend.score > trend.scoreCap;
  }).map((trend) => trend.slug) : [];
  const time = now.getTime(), age = (value: string) => time - Date.parse(value);
  return dataAuditSchema.parse({ inspectedAt: now.toISOString(), mode: "live",
    itemCount: Number(result[0]!.rows[0]!.count), topicCount: Number(result[1]!.rows[0]!.count),
    sampled: Number(result[0]!.rows[0]!.count) > rawItems.length || Number(result[1]!.rows[0]!.count) > rawTopics.length,
    inspectedItems: rawItems.length, inspectedTopics: rawTopics.length, invalidRecords,
    futureTimestamps: [...rawItems.filter((row) => [row.published_at, row.collected_at].some((date) => Date.parse(String(date)) > time)).map((row) => String(row.id)),
      ...rawTopics.filter((row) => [row.first_seen_at, row.last_seen_at].some((date) => Date.parse(String(date)) > time)).map((row) => String(row.id))],
    outside2h: items.filter((i) => age(i.publishedAt) >= 2 * 3600000).length,
    outside24h: items.filter((i) => age(i.publishedAt) > 86400000).length,
    outsideRetention: items.filter((i) => age(i.publishedAt) > 14 * 86400000).map((i) => i.id),
    duplicateUrls: [...urls].filter(([, list]) => list.length > 1).map(([url, items]) => ({ url, items })),
    syndicatedCopies, duplicateTopics, mergeCandidates, conflictingAssignments, relevanceReview, neighborhoodReview, categoryReview,
    badSourceLinks, emptySummaries: [...new Set(emptySummaries)], scoreMismatches,
    oneSourceTopics: metrics.filter((m) => m.current2h > 0 && m.sourceCount === 1).map((m) => m.slug),
    latestSnapshot: at, staleSnapshot: at === null || age(at) > 90 * 60000,
    sourceRuns: runs.map((r) => ({ source: r.source, startedAt: r.startedAt, status: r.status, inserted: r.inserted, errors: r.errors, error: r.errorMessage })),
  });
}
