import "server-only";
import { randomUUID } from "node:crypto";
import type { Client, Transaction, InStatement } from "@libsql/client";
import { z } from "zod";
import { categorySchema, neighborhoodSchema, sourceSchema, coordinates, hotspotSchema, type Source, type Hotspot } from "@/lib/domain/schema";
import { itemRecordSchema, itemFieldsSchema, topicRecordSchema, topicFieldsSchema, topicUpdateSchema, snapshotRecordSchema, ingestionRunSchema, enrichmentStatusSchema,
  legacyLifecycle, type ItemRecord, type TopicRecord, type TopicUpdate, type SnapshotRecord, type IngestionRun, type DuplicateMatch } from "./records";
import { itemFromRow, topicFromRow, snapshotFromRow, runFromRow, itemInsert, topicInsert, snapshotInsert, touchTopic } from "./mapping";
import { migrate } from "./schema";

export const DAY = 86400000;
export const ITEM_RETENTION_DAYS = 14;
export const SNAPSHOT_RETENTION_DAYS = 30;
const iso = (value: Date) => z.date().parse(value).toISOString();
const key = z.string().min(1).max(200);
const limit = z.number().int().min(1).max(1000);
const fixture = z.boolean().default(false);
const createTopicSchema = topicFieldsSchema.extend({ id: key.default(() => randomUUID()), neighborhood: neighborhoodSchema.nullable().default(null),
  lifecycle: topicFieldsSchema.shape.lifecycle.default("inactive"), pulseScore: z.number().int().min(0).max(100).default(0), confidence: z.number().min(0).max(1).default(0),
  enrichmentMethod: z.enum(["rules", "ai"]).default("rules"), isFixture: fixture });
export type CreateTopic = z.input<typeof createTopicSchema>;
const recentQuerySchema = z.object({ since: z.date(), until: z.date().optional(), source: sourceSchema.optional(), topicId: key.optional(),
  category: categorySchema.optional(), neighborhood: neighborhoodSchema.optional(), enrichmentStatus: enrichmentStatusSchema.optional(),
  limit: limit.default(100), offset: z.number().int().min(0).max(1000000).default(0), isFixture: fixture }).refine((v) => !v.until || v.until >= v.since, "Invalid time range");
export type RecentItemsQuery = z.input<typeof recentQuerySchema>;
export type RunCompletion = Pick<IngestionRun, "finishedAt" | "discovered" | "inserted" | "duplicates" | "errors" | "status" | "errorMessage">;

export async function writeTransaction<T>(client: Client, work: (tx: Transaction) => Promise<T>): Promise<T> {
  await client.execute("PRAGMA foreign_keys = ON");
  const tx = await client.transaction("write");
  try { const result = await work(tx); await tx.commit(); return result; }
  finally { tx.close(); }
}
export async function writeBatch(client: Client, statements: InStatement[]) {
  await client.execute("PRAGMA foreign_keys = ON");
  return client.batch(statements, "write");
}
export function retentionStatements(now: Date): InStatement[] {
  const itemCutoff = new Date(now.getTime() - ITEM_RETENTION_DAYS * DAY).toISOString();
  const historyCutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * DAY).toISOString();
  return [
    { sql: "DELETE FROM items WHERE published_at < ?", args: [itemCutoff] },
    { sql: "DELETE FROM topic_snapshots WHERE captured_at < ?", args: [historyCutoff] },
    { sql: "DELETE FROM pulse_snapshots WHERE captured_at < ?", args: [historyCutoff] },
    { sql: "DELETE FROM ingestion_runs WHERE finished_at < ? AND status <> 'running'", args: [historyCutoff] },
    { sql: "DELETE FROM topics WHERE last_seen_at < ? AND NOT EXISTS (SELECT 1 FROM items WHERE topic_id=topics.id) AND NOT EXISTS (SELECT 1 FROM topic_snapshots WHERE topic_id=topics.id)", args: [historyCutoff] },
    { sql: "DELETE FROM leases WHERE expires_at < ?", args: [now.getTime()] },
  ];
}

export class DataRepository {
  constructor(readonly client: Client) {}
  async initialize() { return migrate(this.client); }

  async detectDuplicates(identity: Pick<ItemRecord, "id" | "source" | "sourceId" | "canonicalUrl" | "contentFingerprint" | "isFixture">): Promise<DuplicateMatch[]> {
    const v = itemFieldsSchema.pick({ id: true, source: true, sourceId: true, canonicalUrl: true, contentFingerprint: true, isFixture: true }).parse(identity);
    const result = await this.client.execute({ sql: `SELECT * FROM items WHERE is_fixture=? AND (id=? OR (source=? AND source_id=?) OR canonical_url=? OR content_fingerprint=?) ORDER BY id`,
      args: [Number(v.isFixture), v.id, v.source, v.sourceId, v.canonicalUrl, v.contentFingerprint] });
    return result.rows.map((r) => {
      const item = itemFromRow(r);
      const reasons: DuplicateMatch["reasons"] = [];
      if (item.id === v.id) reasons.push("id");
      if (item.source === v.source && item.sourceId === v.sourceId) reasons.push("source_identity");
      if (item.canonicalUrl === v.canonicalUrl) reasons.push("canonical_url");
      if (item.contentFingerprint === v.contentFingerprint) reasons.push("content_fingerprint");
      return { item, reasons };
    });
  }

  async insertItem(input: ItemRecord): Promise<{ inserted: boolean; item: ItemRecord; duplicate: DuplicateMatch | null }> {
    const item = itemRecordSchema.parse(input);
    const result = await writeBatch(this.client, [itemInsert(item), touchTopic(item.id)]);
    const row = result[0]?.rows[0];
    if (row) return { inserted: true, item: itemFromRow(row), duplicate: null };
    const duplicate = (await this.detectDuplicates(item))[0];
    if (!duplicate) throw new Error("Item identity conflicts with another dataset");
    return { inserted: false, item: duplicate.item, duplicate };
  }

  async findRecentItems(input: RecentItemsQuery): Promise<ItemRecord[]> {
    const q = recentQuerySchema.parse(input);
    const filters = ["is_fixture=?", "published_at>=?", "published_at<=?"];
    const args: Array<string | number> = [Number(q.isFixture), iso(q.since), iso(q.until ?? new Date())];
    const optional: Array<[string, string | undefined]> = [["source", q.source], ["topic_id", q.topicId], ["category", q.category], ["neighborhood", q.neighborhood], ["enrichment_status", q.enrichmentStatus]];
    for (const [column, value] of optional) if (value !== undefined) { filters.push(`${column}=?`); args.push(value); }
    const result = await this.client.execute({ sql: `SELECT * FROM items WHERE ${filters.join(" AND ")} ORDER BY published_at DESC,id ASC LIMIT ? OFFSET ?`, args: [...args, q.limit, q.offset] });
    return result.rows.map(itemFromRow);
  }

  async createTopic(input: CreateTopic): Promise<TopicRecord> {
    const topic = topicRecordSchema.parse(createTopicSchema.parse(input));
    const result = await this.client.execute(topicInsert(topic));
    const row = result.rows[0];
    if (row) return topicFromRow(row);
    const existing = await this.findTopicBySlug(topic.slug, topic.isFixture);
    if (!existing) throw new Error("Topic could not be created");
    return existing;
  }

  async findTopicBySlug(slug: string, isFixture = false): Promise<TopicRecord | null> {
    const valid = topicFieldsSchema.shape.slug.parse(slug);
    const result = await this.client.execute({ sql: "SELECT * FROM topics WHERE slug=? AND is_fixture=?", args: [valid, Number(z.boolean().parse(isFixture))] });
    return result.rows[0] ? topicFromRow(result.rows[0]) : null;
  }

  async updateTopic(id: string, changes: TopicUpdate): Promise<TopicRecord | null> {
    key.parse(id); const patch = topicUpdateSchema.parse(changes);
    return writeTransaction(this.client, async (tx) => {
      const row = (await tx.execute({ sql: "SELECT * FROM topics WHERE id=?", args: [id] })).rows[0];
      if (!row) return null;
      const t = topicRecordSchema.parse({ ...topicFromRow(row), ...patch });
      await tx.batch([
        { sql: `UPDATE topics SET slug=?,canonical_label=?,category=?,neighborhood=?,first_seen_at=?,last_seen_at=?,lifecycle=?,lifecycle_v2=?,pulse_score=?,confidence=?,summary=?,enrichment_method=? WHERE id=?`,
          args: [t.slug, t.canonicalLabel, t.category, t.neighborhood, t.firstSeenAt, t.lastSeenAt, legacyLifecycle(t.lifecycle), t.lifecycle, t.pulseScore, t.confidence, t.summary, t.enrichmentMethod, id] },
        { sql: "UPDATE items SET category=? WHERE topic_id=?", args: [t.category, id] },
      ]);
      return t;
    });
  }

  async assignItemToTopic(itemId: string, topicId: string, input: { neighborhood?: ItemRecord["neighborhood"]; localRelevance?: number } = {}): Promise<ItemRecord | null> {
    key.parse(itemId); key.parse(topicId);
    const options = z.object({ neighborhood: neighborhoodSchema.nullable().optional(), localRelevance: z.number().min(0.5).max(1).default(1) }).parse(input);
    return writeTransaction(this.client, async (tx) => {
      const rows = await tx.batch([{ sql: "SELECT * FROM items WHERE id=?", args: [itemId] }, { sql: "SELECT * FROM topics WHERE id=?", args: [topicId] }]);
      if (!rows[0]?.rows[0]) return null;
      if (!rows[1]?.rows[0]) throw new Error("Topic not found");
      const item = itemFromRow(rows[0].rows[0]), topic = topicFromRow(rows[1].rows[0]);
      if (item.isFixture !== topic.isFixture) throw new Error("Cannot assign across datasets");
      const updated = itemRecordSchema.parse({ ...item, topicId, category: topic.category, neighborhood: options.neighborhood === undefined ? item.neighborhood : options.neighborhood,
        localRelevance: options.localRelevance, enrichmentStatus: "completed" });
      await tx.batch([{ sql: "UPDATE items SET topic_id=?,category=?,neighborhood=?,local_relevance=?,enrichment_status='completed' WHERE id=?",
        args: [topicId, updated.category, updated.neighborhood, updated.localRelevance, itemId] }, touchTopic(itemId)]);
      return updated;
    });
  }

  async listActiveTopics(input: { now?: Date; category?: TopicRecord["category"]; neighborhood?: TopicRecord["neighborhood"]; limit?: number; isFixture?: boolean } = {}): Promise<TopicRecord[]> {
    const q = z.object({ now: z.date().default(() => new Date()), category: categorySchema.optional(), neighborhood: neighborhoodSchema.nullable().optional(), limit: limit.default(100), isFixture: fixture }).parse(input);
    const filters = ["t.is_fixture=?", "coalesce(t.lifecycle_v2,t.lifecycle)<>'inactive'", "(SELECT count(*) FROM items i WHERE i.topic_id=t.id AND i.local_relevance>=0.5 AND i.enrichment_status='completed' AND i.published_at>? AND i.published_at<=?)>=2"];
    const args: Array<string | number | null> = [Number(q.isFixture), new Date(q.now.getTime() - 2 * 3600000).toISOString(), iso(q.now)];
    if (q.category) { filters.push("t.category=?"); args.push(q.category); }
    if (q.neighborhood !== undefined) { filters.push("t.neighborhood IS ?"); args.push(q.neighborhood); }
    const result = await this.client.execute({ sql: `SELECT t.* FROM topics t WHERE ${filters.join(" AND ")} ORDER BY t.pulse_score DESC,
      coalesce((SELECT velocity_score FROM topic_snapshots WHERE topic_id=t.id ORDER BY captured_at DESC LIMIT 1),0) DESC,t.slug ASC LIMIT ?`, args: [...args, q.limit] });
    return result.rows.map(topicFromRow);
  }

  async saveSnapshots(snapshots: SnapshotRecord[]): Promise<void> {
    const valid = snapshots.map((s) => snapshotRecordSchema.parse(s));
    if (valid.length) await writeBatch(this.client, valid.map((s) => snapshotInsert(s)));
  }

  async fetchTopicHistory(topicId: string, input: { since?: Date; until?: Date; limit?: number } = {}): Promise<SnapshotRecord[]> {
    key.parse(topicId);
    const q = z.object({ since: z.date().optional(), until: z.date().optional(), limit: limit.default(200) }).parse(input);
    if (q.since && q.until && q.since > q.until) throw new Error("Invalid time range");
    const filters = ["topic_id=?"], args: Array<string | number> = [topicId];
    if (q.since) { filters.push("captured_at>=?"); args.push(iso(q.since)); }
    if (q.until) { filters.push("captured_at<=?"); args.push(iso(q.until)); }
    const result = await this.client.execute({ sql: `SELECT * FROM topic_snapshots WHERE ${filters.join(" AND ")} ORDER BY captured_at DESC,algorithm_version DESC LIMIT ?`, args: [...args, q.limit] });
    return result.rows.map(snapshotFromRow).reverse();
  }

  async fetchHotspotActivity(input: { since: Date; until?: Date; isFixture?: boolean }): Promise<Hotspot[]> {
    const q = z.object({ since: z.date(), until: z.date().default(() => new Date()), isFixture: fixture }).parse(input);
    if (q.until < q.since) throw new Error("Invalid time range");
    const result = await this.client.execute({ sql: `SELECT i.neighborhood,count(*) AS count,json_group_array(DISTINCT t.slug) AS topics
      FROM items i JOIN topics t ON t.id=i.topic_id WHERE i.is_fixture=? AND i.published_at>? AND i.published_at<=?
      AND i.neighborhood IS NOT NULL AND i.local_relevance>=0.5 AND i.enrichment_status='completed' GROUP BY i.neighborhood ORDER BY count DESC,i.neighborhood ASC`,
      args: [Number(q.isFixture), iso(q.since), iso(q.until)] });
    return result.rows.flatMap((r) => {
      const neighborhood = neighborhoodSchema.parse(r.neighborhood);
      const center = coordinates[neighborhood];
      if (!center) return [];
      const [lat, lng] = center;
      return [hotspotSchema.parse({ neighborhood, lat, lng, count: r.count, topics: JSON.parse(String(r.topics)) })];
    });
  }

  async startIngestionRun(source: Source, startedAt = new Date(), isFixture = false): Promise<IngestionRun> {
    const run = ingestionRunSchema.parse({ id: randomUUID(), source, startedAt: iso(startedAt), finishedAt: null, discovered: 0, inserted: 0, duplicates: 0, errors: 0, status: "running", errorMessage: null, isFixture });
    await this.client.execute({ sql: "INSERT INTO ingestion_runs(id,source,started_at,is_fixture) VALUES (?,?,?,?)", args: [run.id, run.source, run.startedAt, Number(run.isFixture)] });
    return run;
  }

  async completeIngestionRun(id: string, stats: RunCompletion): Promise<IngestionRun | null> {
    key.parse(id);
    return writeTransaction(this.client, async (tx) => {
      const row = (await tx.execute({ sql: "SELECT * FROM ingestion_runs WHERE id=?", args: [id] })).rows[0];
      if (!row) return null;
      const existing = runFromRow(row);
      if (existing.status !== "running") return existing;
      const run = ingestionRunSchema.parse({ ...existing, ...stats });
      if (run.status === "running") throw new Error("Completion requires a terminal status");
      await tx.execute({ sql: "UPDATE ingestion_runs SET finished_at=?,discovered=?,inserted=?,duplicates=?,errors=?,status=?,error_message=? WHERE id=?",
        args: [run.finishedAt, run.discovered, run.inserted, run.duplicates, run.errors, run.status, run.errorMessage, id] });
      return run;
    });
  }

  async ingestionStatus(input: { source?: Source; limit?: number; onlyRunning?: boolean; isFixture?: boolean } = {}): Promise<IngestionRun[]> {
    const q = z.object({ source: sourceSchema.optional(), limit: limit.default(20), onlyRunning: z.boolean().default(false), isFixture: fixture }).parse(input);
    const filters = ["is_fixture=?"], args: Array<string | number> = [Number(q.isFixture)];
    if (q.source) { filters.push("source=?"); args.push(q.source); }
    if (q.onlyRunning) filters.push("status='running'");
    const result = await this.client.execute({ sql: `SELECT * FROM ingestion_runs WHERE ${filters.join(" AND ")} ORDER BY started_at DESC,rowid DESC LIMIT ?`, args: [...args, q.limit] });
    return result.rows.map(runFromRow);
  }

  async recoverInterruptedRuns(now: Date): Promise<number> {
    const result = await this.client.execute({ sql: "UPDATE ingestion_runs SET status='abandoned',finished_at=?,errors=errors+1,error_message='RUN_INTERRUPTED' WHERE status='running' AND started_at<?",
      args: [iso(now), new Date(now.getTime() - 120000).toISOString()] });
    return result.rowsAffected;
  }

  async pruneOldData(now = new Date()): Promise<{ items: number; snapshots: number; pulseSnapshots: number; ingestionRuns: number; topics: number }> {
    iso(now);
    const results = await writeBatch(this.client, retentionStatements(now));
    return { items: results[0]?.rowsAffected ?? 0, snapshots: results[1]?.rowsAffected ?? 0, pulseSnapshots: results[2]?.rowsAffected ?? 0,
      ingestionRuns: results[3]?.rowsAffected ?? 0, topics: results[4]?.rowsAffected ?? 0 };
  }
}
