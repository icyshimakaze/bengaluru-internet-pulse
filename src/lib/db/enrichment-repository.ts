import "server-only";
import { z } from "zod";
import type { Client, Transaction } from "@libsql/client";
import { enrichmentTopicSchema, enrichmentResultSchema, enrichmentProviderSchema, semanticCategorySchema, legacySemanticCategory,
  editorialCategory, validateEnrichment, PRODUCTION_MODEL, type EnrichmentAssignment, type EnrichmentTopic } from "@/lib/domain/enrichment";
import { itemRecordSchema, type ItemRecord, type TopicRecord } from "./records";
import { itemInsert, itemFromRow, toSignal } from "./mapping";
import { writeTransaction, DAY } from "./data-repository";

export const enrichmentRecordSchema = z.object({
  itemId: z.string().min(1).max(200), provider: enrichmentProviderSchema, model: z.literal(PRODUCTION_MODEL).nullable(),
  result: enrichmentResultSchema, enrichedAt: z.iso.datetime(),
}).strict().refine((v) => v.itemId === v.result.signal_id && (v.provider === "mock" ? v.model === null : v.model === PRODUCTION_MODEL), "Invalid enrichment provenance");
export type EnrichmentRecord = z.infer<typeof enrichmentRecordSchema>;

async function verifyLease(tx: Transaction, owner: string, now: Date) {
  z.string().uuid().parse(owner); z.date().parse(now);
  const lease = await tx.execute({ sql: "SELECT owner FROM leases WHERE name='ingest' AND owner=? AND expires_at>?", args: [owner, now.getTime()] });
  if (!lease.rows.length) throw new Error("INGESTION_LEASE_EXPIRED");
}

export class EnrichmentRepository {
  constructor(readonly client: Client) {}
  async collectPending(items: ItemRecord[], owner: string, now: Date): Promise<number> {
    const valid = items.map((i) => itemRecordSchema.parse(i));
    if (valid.some((i) => i.enrichmentStatus !== "pending" || i.topicId !== null || i.category !== null)) throw new Error("COLLECTION_REQUIRES_PENDING_ITEMS");
    return writeTransaction(this.client, async (tx) => {
      await verifyLease(tx, owner, now);
      const results = valid.length ? await tx.batch(valid.map(itemInsert)) : [];
      return results.reduce((count, r) => count + r.rows.length, 0);
    });
  }

  async activeTopics(now: Date, isFixture: boolean): Promise<EnrichmentTopic[]> {
    z.date().parse(now); z.boolean().parse(isFixture);
    const rows = await this.client.execute({ sql: `SELECT t.*,e.semantic_category FROM topics t LEFT JOIN topic_enrichments e ON e.topic_id=t.id
      WHERE t.is_fixture=? AND t.last_seen_at>=? AND t.last_seen_at<=? ORDER BY t.last_seen_at DESC,t.slug ASC LIMIT 50`,
      args: [Number(isFixture), new Date(now.getTime() - DAY).toISOString(), now.toISOString()] });
    return rows.rows.map((r) => enrichmentTopicSchema.parse({ id: r.id, slug: r.slug, canonical_label: r.canonical_label,
      category: r.semantic_category === null ? legacySemanticCategory[r.category as TopicRecord["category"]] : semanticCategorySchema.parse(r.semantic_category) }));
  }

  async claimPending(now: Date, isFixture: boolean, limit: number, owner: string): Promise<ItemRecord[]> {
    z.date().parse(now); z.boolean().parse(isFixture); z.number().int().min(1).max(30).parse(limit);
    return writeTransaction(this.client, async (tx) => {
      await verifyLease(tx, owner, now);
      const rows = await tx.execute({ sql: `SELECT * FROM items WHERE is_fixture=? AND enrichment_status IN ('pending','failed')
        AND published_at>=? AND published_at<=? AND enrichment_attempts<3 AND (enrichment_attempted_at IS NULL OR enrichment_attempted_at<=?)
        ORDER BY enrichment_attempts ASC,published_at ASC,id ASC LIMIT ?`, args: [Number(isFixture), new Date(now.getTime() - DAY).toISOString(), now.toISOString(),
        new Date(now.getTime() - 15 * 60000).toISOString(), limit] });
      const items = rows.rows.map(itemFromRow);
      if (items.length) await tx.batch(items.map((i) => ({ sql: "UPDATE items SET enrichment_attempts=enrichment_attempts+1,enrichment_attempted_at=? WHERE id=?", args: [now.toISOString(), i.id] })));
      return items;
    });
  }

  async find(itemId: string): Promise<EnrichmentRecord | null> {
    z.string().min(1).max(200).parse(itemId);
    const row = (await this.client.execute({ sql: "SELECT * FROM item_enrichments WHERE item_id=?", args: [itemId] })).rows[0];
    return row ? enrichmentRecordSchema.parse({ itemId: row.item_id, provider: row.provider, model: row.model,
      result: JSON.parse(String(row.payload)), enrichedAt: row.enriched_at }) : null;
  }
}

export async function applyEnrichments(tx: Transaction, assignments: EnrichmentAssignment[], topics: TopicRecord[], isFixture: boolean, now: Date): Promise<void> {
  if (!assignments.length) return;
  const metadata = new Map((await tx.execute({ sql: "SELECT e.topic_id,e.semantic_category FROM topic_enrichments e JOIN topics t ON t.id=e.topic_id WHERE t.is_fixture=?", args: [Number(isFixture)] })).rows.map((r) => [String(r.topic_id), semanticCategorySchema.parse(r.semantic_category)]));
  const proposed = new Map(assignments.flatMap((a) => a.topic ? [[a.topic.id, a.topic.category] as const] : []));
  const catalog = topics.map((t) => enrichmentTopicSchema.parse({ id: t.id, slug: t.slug, canonical_label: t.canonicalLabel,
    category: metadata.get(t.id) ?? proposed.get(t.id) ?? legacySemanticCategory[t.category] }));
  for (const assignment of assignments) {
    const row = (await tx.execute({ sql: "SELECT * FROM items WHERE id=? AND is_fixture=?", args: [assignment.result.signal_id, Number(isFixture)] })).rows[0];
    if (!row) throw new Error("ENRICHMENT_ITEM_MISSING");
    const item = itemFromRow(row);
    // Terminal items are protected even if a caller accidentally submits one twice.
    if (item.enrichmentStatus === "completed" || item.enrichmentStatus === "irrelevant") continue;
    const result = validateEnrichment(assignment.result, toSignal(item), catalog);
    const record = enrichmentRecordSchema.parse({ itemId: item.id, provider: assignment.provider, model: assignment.model, result, enrichedAt: now.toISOString() });
    if (result.confidence < (result.existing_topic_id ? 0.75 : 0.6)) throw new Error("ENRICHMENT_LOW_CONFIDENCE");
    const topic = assignment.topic ? topics.find((t) => t.id === assignment.topic?.id) : null;
    if (result.local_relevance >= 0.5 && (!topic || topic.slug !== result.slug || topic.canonicalLabel !== result.canonical_label || topic.category !== editorialCategory[result.category] ||
      result.existing_topic_id !== null && result.existing_topic_id !== topic.id)) throw new Error("ENRICHMENT_ASSIGNMENT_MISMATCH");
    const neighborhood = result.neighborhood === "Citywide" || result.neighborhood === "Unknown" ? null : result.neighborhood;
    await tx.execute({ sql: `UPDATE items SET topic_id=?,category=?,neighborhood=?,local_relevance=?,enrichment_status=?
      WHERE id=? AND is_fixture=? AND enrichment_status IN ('pending','failed')`, args: [topic?.id ?? null, topic?.category ?? null, neighborhood,
      result.local_relevance, result.local_relevance >= 0.5 ? "completed" : "irrelevant", item.id, Number(isFixture)] });
    await tx.execute({ sql: `INSERT INTO item_enrichments(item_id,provider,model,payload,classification_confidence,enriched_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(item_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,payload=excluded.payload,classification_confidence=excluded.classification_confidence,enriched_at=excluded.enriched_at`,
      args: [record.itemId, record.provider, record.model, JSON.stringify(record.result), record.result.confidence, record.enrichedAt] });
    if (topic) await tx.execute({ sql: "INSERT INTO topic_enrichments(topic_id,semantic_category) VALUES (?,?) ON CONFLICT(topic_id) DO NOTHING", args: [topic.id, result.category] });
  }
}
