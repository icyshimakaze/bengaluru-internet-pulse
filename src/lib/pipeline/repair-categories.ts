import "server-only";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { itemFromRow, toSignal } from "@/lib/db/mapping";
import { enrichmentRecordSchema } from "@/lib/db/enrichment-repository";
import { writeTransaction } from "@/lib/db/data-repository";
import { editorialCategory, validateEnrichment, type EnrichmentTopic } from "@/lib/domain/enrichment";
import { classifyCategory } from "@/lib/enrichment/heuristic";

export const categoryRepairSchema = z.object({ itemId: z.string(), topicId: z.string(), from: z.enum(["Mobility", "Technology"]), to: z.literal("City life"), semantic: z.enum(["food", "events"]) });
export type CategoryRepair = z.infer<typeof categoryRepairSchema>;

async function candidates(client: Pick<Client, "execute">) {
  const rows = await client.execute(`SELECT i.*,e.payload,e.provider,e.model,e.enriched_at,t.slug,t.canonical_label
    FROM items i JOIN item_enrichments e ON e.item_id=i.id JOIN topics t ON t.id=i.topic_id
    WHERE i.is_fixture=0 AND i.enrichment_status='completed' AND i.enrichment_provider='heuristic' AND e.provider='heuristic'
    AND t.enrichment_method='rules' AND i.category IN ('Mobility','Technology')
    AND (SELECT count(*) FROM items sibling WHERE sibling.topic_id=i.topic_id)=1 ORDER BY i.id LIMIT 1000`);
  return rows.rows.flatMap((row) => {
    const item = itemFromRow(row);
    // Only the address/organizer leaks reproduced in the real audit are repaired.
    if (!/\b(Food event|Music event|Pizza Making)\b/iu.test(item.title)) return [];
    const category = classifyCategory(`${item.title} ${item.excerpt}`);
    if (category !== "food" && category !== "events") return [];
    const record = enrichmentRecordSchema.parse({ itemId: item.id, provider: row.provider, model: row.model, result: JSON.parse(String(row.payload)), enrichedAt: row.enriched_at });
    const topic: EnrichmentTopic = { id: item.topicId!, slug: String(row.slug), canonical_label: String(row.canonical_label), category };
    const proposed = { ...record.result, category, new_topic: record.result.new_topic ? { ...record.result.new_topic, category } : null };
    const result = validateEnrichment(proposed, toSignal(item), [topic]);
    const repair = categoryRepairSchema.parse({ itemId: item.id, topicId: item.topicId, from: item.category, to: editorialCategory[category], semantic: category });
    return [{ repair, record: { ...record, result } }];
  });
}
export async function previewCategoryRepairs(client: Client): Promise<CategoryRepair[]> {
  return (await candidates(client)).map((item) => item.repair);
}
export async function applyCategoryRepairs(client: Client, owner: string, now: Date): Promise<CategoryRepair[]> {
  z.string().uuid().parse(owner); z.date().parse(now);
  return writeTransaction(client, async (tx) => {
    const lease = await tx.execute({ sql: "SELECT owner FROM leases WHERE name='ingest' AND owner=? AND expires_at>?", args: [owner, now.getTime()] });
    if (!lease.rows.length) throw new Error("INGESTION_LEASE_EXPIRED");
    const changes = await candidates(tx);
    for (const { repair, record } of changes) {
      await tx.execute({ sql: "UPDATE items SET category=? WHERE id=? AND category=? AND enrichment_provider='heuristic'", args: [repair.to, repair.itemId, repair.from] });
      await tx.execute({ sql: "UPDATE topics SET category=? WHERE id=? AND is_fixture=0 AND enrichment_method='rules'", args: [repair.to, repair.topicId] });
      await tx.execute({ sql: "INSERT INTO topic_enrichments(topic_id,semantic_category) VALUES (?,?) ON CONFLICT(topic_id) DO UPDATE SET semantic_category=excluded.semantic_category", args: [repair.topicId, repair.semantic] });
      await tx.execute({ sql: "UPDATE item_enrichments SET payload=?,enriched_at=? WHERE item_id=? AND provider='heuristic'", args: [JSON.stringify(record.result), now.toISOString(), repair.itemId] });
    }
    return changes.map((item) => item.repair);
  });
}
