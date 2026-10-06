import "server-only";
import type { Row, InStatement } from "@libsql/client";
import { type Topic, type Signal, type Observation } from "@/lib/domain/schema";
import { itemRecordSchema, topicRecordSchema, snapshotRecordSchema, ingestionRunSchema, type ItemRecord, type TopicRecord, type SnapshotRecord, type IngestionRun } from "./records";

export function itemFromRow(r: Row): ItemRecord {
  return itemRecordSchema.parse({ id: r.id, source: r.source, sourceId: r.source_id, canonicalUrl: r.canonical_url, originalUrl: r.original_url,
    title: r.title, excerpt: r.excerpt, domain: r.domain, publishedAt: r.published_at, collectedAt: r.collected_at, contentFingerprint: r.content_fingerprint,
    topicId: r.topic_id, category: r.category, neighborhood: r.neighborhood, localRelevance: r.local_relevance,
    enrichmentStatus: r.enrichment_status, timeKind: r.time_kind, ingestionRunId: r.ingestion_run_id, isFixture: r.is_fixture === 1 });
}
export function topicFromRow(r: Row): TopicRecord {
  return topicRecordSchema.parse({ id: r.id, slug: r.slug, canonicalLabel: r.canonical_label, category: r.category, neighborhood: r.neighborhood,
    firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at, lifecycle: r.lifecycle, pulseScore: r.pulse_score,
    confidence: r.confidence, summary: r.summary, enrichmentMethod: r.enrichment_method, isFixture: r.is_fixture === 1 });
}
export function snapshotFromRow(r: Row): SnapshotRecord {
  return snapshotRecordSchema.parse({ topicId: r.topic_id, capturedAt: r.captured_at, count2h: r.count_2h, previousCount2h: r.previous_count_2h,
    count6h: r.count_6h, count24h: r.count_24h, sourceCount: r.source_count, velocityScore: r.velocity_score, volumeScore: r.volume_score,
    diversityScore: r.diversity_score, recencyScore: r.recency_score, confidence: r.confidence, pulseScore: r.pulse_score, lifecycle: r.lifecycle,
    count3h: r.count_3h, previousCount3h: r.previous_count_3h, scoringSourceCount: r.scoring_source_count, algorithmVersion: r.algorithm_version, batchId: r.batch_id });
}
export function runFromRow(r: Row): IngestionRun {
  return ingestionRunSchema.parse({ id: r.id, source: r.source, startedAt: r.started_at, finishedAt: r.finished_at, discovered: r.discovered,
    inserted: r.inserted, duplicates: r.duplicates, errors: r.errors, status: r.status, errorMessage: r.error_message, isFixture: r.is_fixture === 1 });
}
export function toDomainTopic(t: TopicRecord): Topic { return { slug: t.slug, title: t.canonicalLabel, category: t.category, description: t.summary, method: t.enrichmentMethod }; }
export function toSignal(i: ItemRecord): Signal {
  return { id: i.id, source: i.source, sourceId: i.sourceId, canonicalUrl: i.canonicalUrl, url: i.originalUrl, title: i.title, text: i.excerpt,
    publishedAt: i.publishedAt, collectedAt: i.collectedAt, contentHash: i.contentFingerprint, timeKind: i.timeKind };
}
export function toObservations(items: ItemRecord[], topics: TopicRecord[]): Observation[] {
  const slugs = new Map(topics.map((t) => [t.id, t.slug]));
  return items.flatMap((i) => {
    const topicSlug = i.topicId ? slugs.get(i.topicId) : undefined;
    return topicSlug && i.enrichmentStatus === "completed" && i.localRelevance >= 0.5 ? [{ ...toSignal(i), topicSlug, neighborhood: i.neighborhood }] : [];
  });
}
export function fromSignal(signal: Signal, fields: Partial<Pick<ItemRecord, "topicId" | "category" | "neighborhood" | "localRelevance" | "enrichmentStatus" | "ingestionRunId" | "isFixture">> = {}): ItemRecord {
  return itemRecordSchema.parse({ id: signal.id, source: signal.source, sourceId: signal.sourceId, canonicalUrl: signal.canonicalUrl, originalUrl: signal.url,
    title: signal.title, excerpt: signal.text, domain: new URL(signal.canonicalUrl).hostname, publishedAt: signal.publishedAt, collectedAt: signal.collectedAt,
    contentFingerprint: signal.contentHash, timeKind: signal.timeKind, topicId: null, category: null, neighborhood: null,
    localRelevance: 0, enrichmentStatus: "pending", ingestionRunId: null, isFixture: false, ...fields });
}
export function itemInsert(i: ItemRecord): InStatement {
  const v = itemRecordSchema.parse(i);
  return { sql: `INSERT INTO items(id,source,source_id,canonical_url,original_url,title,excerpt,domain,published_at,collected_at,content_fingerprint,topic_id,category,neighborhood,local_relevance,enrichment_status,time_kind,ingestion_run_id,is_fixture)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING *`,
    args: [v.id, v.source, v.sourceId, v.canonicalUrl, v.originalUrl, v.title, v.excerpt, v.domain, v.publishedAt, v.collectedAt, v.contentFingerprint,
      v.topicId, v.category, v.neighborhood, v.localRelevance, v.enrichmentStatus, v.timeKind, v.ingestionRunId, Number(v.isFixture)] };
}
export function topicInsert(t: TopicRecord): InStatement {
  const v = topicRecordSchema.parse(t);
  return { sql: `INSERT INTO topics(id,slug,canonical_label,category,neighborhood,first_seen_at,last_seen_at,lifecycle,pulse_score,confidence,summary,enrichment_method,is_fixture)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(is_fixture,slug) DO NOTHING RETURNING *`, args: [v.id, v.slug, v.canonicalLabel, v.category, v.neighborhood,
    v.firstSeenAt, v.lastSeenAt, v.lifecycle, v.pulseScore, v.confidence, v.summary, v.enrichmentMethod, Number(v.isFixture)] };
}
export function snapshotInsert(s: SnapshotRecord): InStatement {
  const v = snapshotRecordSchema.parse(s);
  return { sql: `INSERT INTO topic_snapshots(topic_id,captured_at,count_2h,previous_count_2h,count_6h,count_24h,source_count,velocity_score,volume_score,diversity_score,recency_score,confidence,pulse_score,lifecycle,count_3h,previous_count_3h,scoring_source_count,algorithm_version,batch_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(topic_id,captured_at) DO UPDATE SET
    count_2h=excluded.count_2h,previous_count_2h=excluded.previous_count_2h,count_6h=excluded.count_6h,count_24h=excluded.count_24h,source_count=excluded.source_count,
    velocity_score=excluded.velocity_score,volume_score=excluded.volume_score,diversity_score=excluded.diversity_score,recency_score=excluded.recency_score,
    confidence=excluded.confidence,pulse_score=excluded.pulse_score,lifecycle=excluded.lifecycle,count_3h=excluded.count_3h,previous_count_3h=excluded.previous_count_3h,
    scoring_source_count=excluded.scoring_source_count,algorithm_version=excluded.algorithm_version,batch_id=excluded.batch_id`,
    args: [v.topicId, v.capturedAt, v.count2h, v.previousCount2h, v.count6h, v.count24h, v.sourceCount, v.velocityScore, v.volumeScore, v.diversityScore,
      v.recencyScore, v.confidence, v.pulseScore, v.lifecycle, v.count3h, v.previousCount3h, v.scoringSourceCount, v.algorithmVersion, v.batchId] };
}
export function touchTopic(itemId: string): InStatement {
  return { sql: `UPDATE topics SET first_seen_at=min(first_seen_at,(SELECT published_at FROM items WHERE id=?)),
    last_seen_at=max(last_seen_at,(SELECT published_at FROM items WHERE id=?)) WHERE id=(SELECT topic_id FROM items WHERE id=?)`, args: [itemId, itemId, itemId] };
}
