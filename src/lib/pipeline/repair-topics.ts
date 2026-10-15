import "server-only";
import { z } from "zod";
import type { Client } from "@libsql/client";
import { itemFromRow, toSignal, topicFromRow, topicInsert } from "@/lib/db/mapping";
import { enrichmentRecordSchema } from "@/lib/db/enrichment-repository";
import { writeTransaction } from "@/lib/db/data-repository";
import { enrichmentTopicSchema, editorialCategory, legacySemanticCategory, validateEnrichment } from "@/lib/domain/enrichment";
import { HeuristicEnrichmentProvider } from "@/lib/enrichment/heuristic";
import { namedEventIdentity, jobIdentity, fundingAmount } from "./matching";
import { detectBengaluru } from "./location";

async function planRepairs(client: Pick<Client, "execute">) {
  const rows = (await client.execute(`SELECT i.*,e.provider,e.model,e.payload,e.enriched_at FROM items i JOIN item_enrichments e ON e.item_id=i.id
    WHERE i.is_fixture=0 AND i.enrichment_provider='heuristic' AND e.provider='heuristic' AND i.enrichment_status IN ('completed','irrelevant') ORDER BY i.published_at,i.id LIMIT 2000`)).rows;
  const records = rows.map((row) => ({ item: itemFromRow(row), record: enrichmentRecordSchema.parse({ itemId: row.id, provider: row.provider, model: row.model, result: JSON.parse(String(row.payload)), enrichedAt: row.enriched_at }) }));
  const topicRows = (await client.execute("SELECT t.*,e.semantic_category FROM topics t LEFT JOIN topic_enrichments e ON e.topic_id=t.id WHERE t.is_fixture=0 ORDER BY t.first_seen_at,t.id")).rows;
  const topics = topicRows.map(topicFromRow);
  const named = records.filter(({ item }) => namedEventIdentity(item.title));
  // Explicit repair is deliberately bounded and only re-evaluates supported event anchors.
  if (named.length > 30) throw new Error("TOPIC_REPAIR_LIMIT");
  const namedIds = new Set(named.map(({ item }) => item.topicId));
  const catalog = topicRows.filter((row) => namedIds.has(String(row.id))).map((row) => enrichmentTopicSchema.parse({ id: row.id, slug: row.slug, canonical_label: row.canonical_label, category: row.semantic_category ?? legacySemanticCategory[String(row.category) as keyof typeof legacySemanticCategory] }));
  const results = new Map<string, { result: Awaited<ReturnType<HeuristicEnrichmentProvider["enrich"]>>[number]; topic: (typeof catalog)[number] }>();
  const provider = new HeuristicEnrichmentProvider();
  // Batches stay within the same validation limit as ordinary enrichment.
  for (let offset = 0; offset < named.length; offset += 10) {
    const batch = named.slice(offset, offset + 10);
    const classified = await provider.enrich(batch.map(({ item }) => toSignal(item)), catalog, { signal: new AbortController().signal });
    for (const result of classified) if (result.local_relevance >= 0.5 && result.confidence >= 0.6) {
      const topic = catalog.find((t) => t.id === result.existing_topic_id || t.slug === result.slug)
        ?? enrichmentTopicSchema.parse({ id: `repair-${result.slug}`, slug: result.slug, canonical_label: result.canonical_label, category: result.category });
      if (!catalog.some((t) => t.id === topic.id)) catalog.push(topic);
      results.set(result.signal_id, { result, topic });
    }
  }
  for (const targetId of new Set([...results.values()].map(({ topic }) => topic.id))) {
    const members = named.filter(({ item }) => results.get(item.id)?.topic.id === targetId).sort((a, b) =>
      Number(detectBengaluru(b.item.title)) - Number(detectBengaluru(a.item.title)) || Number(fundingAmount(b.item.title) !== null) - Number(fundingAmount(a.item.title) !== null));
    const preferred = members[0];
    if (!preferred) continue;
    const [canonical] = await provider.enrich([toSignal(preferred.item)], [], { signal: new AbortController().signal });
    for (const match of results.values()) if (match.topic.id === targetId) {
      match.topic.canonical_label = canonical!.canonical_label;
      match.result = { ...match.result, canonical_label: canonical!.canonical_label,
        new_topic: match.result.new_topic ? { ...match.result.new_topic, canonical_label: canonical!.canonical_label } : null };
    }
  }
  const changes = records.flatMap(({ item, record }) => {
    const matched = results.get(item.id);
    if (matched && (item.topicId !== matched.topic.id || item.enrichmentStatus !== "completed" || record.result.canonical_label !== matched.result.canonical_label)) return [{ item, record, ...matched }];
    const job = jobIdentity(item.title), current = topics.find((t) => t.id === item.topicId);
    if (!job?.id || !current || records.filter((r) => r.item.topicId === current.id).length !== 1) return [];
    const label = `${job.role.slice(0, 75)} Job ${job.id}`;
    if (current.canonicalLabel === label) return [];
    const topic = enrichmentTopicSchema.parse({ id: current.id, slug: current.slug, canonical_label: label, category: record.result.category });
    const result = validateEnrichment({ ...record.result, canonical_label: label, new_topic: record.result.new_topic ? { ...record.result.new_topic, canonical_label: label } : null }, toSignal(item), [topic]);
    return [{ item, record, result, topic }];
  });
  return { changes, topics, catalog };
}
export async function repairStoredTopics(client: Client, options: { apply?: boolean; owner?: string; now: Date }) {
  z.date().parse(options.now);
  const summarize = (plan: Awaited<ReturnType<typeof planRepairs>>) => plan.changes.map(({ item, topic }) => ({ itemId: item.id, fromTopic: item.topicId, toTopic: topic.id, label: topic.canonical_label }));
  if (!options.apply) return summarize(await planRepairs(client));
  z.string().uuid().parse(options.owner);
  return writeTransaction(client, async (tx) => {
    const lease = await tx.execute({ sql: "SELECT owner FROM leases WHERE name='ingest' AND owner=? AND expires_at>?", args: [options.owner!, options.now.getTime()] });
    if (!lease.rows.length) throw new Error("INGESTION_LEASE_EXPIRED");
    const plan = await planRepairs(tx);
    for (const { item, result, topic } of plan.changes) {
      validateEnrichment(result, toSignal(item), plan.catalog.concat(topic));
      const existing = plan.topics.find((t) => t.id === topic.id);
      if (!existing) {
        await tx.execute(topicInsert({ id: topic.id, slug: topic.slug, canonicalLabel: topic.canonical_label, category: editorialCategory[topic.category], neighborhood: null,
          firstSeenAt: item.publishedAt, lastSeenAt: item.publishedAt, lifecycle: "inactive", pulseScore: 0, confidence: 0, summary: result.summary, enrichmentMethod: "rules", isFixture: false }));
      } else if (existing.canonicalLabel !== topic.canonical_label) await tx.execute({ sql: "UPDATE topics SET canonical_label=? WHERE id=?", args: [topic.canonical_label, topic.id] });
      await tx.execute({ sql: "UPDATE items SET topic_id=?,category=?,local_relevance=?,enrichment_status='completed' WHERE id=? AND enrichment_provider='heuristic'", args: [topic.id, editorialCategory[topic.category], result.local_relevance, item.id] });
      await tx.execute({ sql: "INSERT INTO topic_enrichments(topic_id,semantic_category) VALUES (?,?) ON CONFLICT(topic_id) DO UPDATE SET semantic_category=excluded.semantic_category", args: [topic.id, topic.category] });
      await tx.execute({ sql: "UPDATE item_enrichments SET payload=?,enriched_at=? WHERE item_id=? AND provider='heuristic'", args: [JSON.stringify(result), options.now.toISOString(), item.id] });
    }
    // Empty legacy topics retain their historical snapshots, but leave the active catalog.
    await tx.execute("UPDATE topics SET lifecycle='inactive',lifecycle_v2='inactive',pulse_score=0,confidence=0 WHERE is_fixture=0 AND NOT EXISTS (SELECT 1 FROM items WHERE items.topic_id=topics.id)");
    return summarize(plan);
  });
}
