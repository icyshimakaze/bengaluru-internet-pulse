import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { topicSchema, pulseSchema, storedPulseSchema, type Topic, type Observation, type Pulse, type SourceStatus } from "@/lib/domain/schema";
import { computeTrends, evaluateTopics, deduplicateEvidence, computeHotspots, HOUR } from "@/lib/trends/engine";
import { upgradeLegacyPulse } from "@/lib/trends/compatibility";
import { topicSnapshot } from "@/lib/trends/snapshots";
import { DataRepository, DAY, ITEM_RETENTION_DAYS, retentionStatements, writeTransaction } from "./data-repository";
import { itemRecordSchema, topicRecordSchema, ingestionRunSchema, legacyLifecycle, type ItemRecord, type TopicRecord, type IngestionRun } from "./records";
import { itemFromRow, topicFromRow, runFromRow, toDomainTopic, toObservations, fromSignal, itemInsert, topicInsert, snapshotInsert } from "./mapping";
import { EnrichmentRepository, applyEnrichments } from "./enrichment-repository";
import type { EnrichmentAssignment } from "@/lib/domain/enrichment";
import { enrichmentRunSchema } from "@/lib/domain/enrichment-providers";

export type PublishOptions = {
  items?: ItemRecord[];
  topicRecords?: TopicRecord[];
  runs?: Array<{ id: string; health: SourceStatus }>;
  enrichments?: EnrichmentAssignment[];
};

// Domain read models and the pipeline share this facade. Components never import it.
export class Repository extends DataRepository {
  get enrichment() { return new EnrichmentRepository(this.client); }
  async acquireLease(now: Date): Promise<string | null> {
    z.date().parse(now);
    const owner = randomUUID();
    const result = await this.client.execute({ sql: "INSERT INTO leases(name,owner,expires_at) VALUES ('ingest',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<=?",
      args: [owner, now.getTime() + 120000, now.getTime()] });
    return result.rowsAffected === 1 ? owner : null;
  }
  async releaseLease(owner: string) { await this.client.execute({ sql: "DELETE FROM leases WHERE name='ingest' AND owner=?", args: [owner] }); }

  async load(now: Date, isFixture = false) {
    z.date().parse(now); z.boolean().parse(isFixture);
    const results = await this.client.batch([
      { sql: "SELECT * FROM topics WHERE is_fixture=? ORDER BY slug", args: [Number(isFixture)] },
      { sql: "SELECT * FROM items WHERE is_fixture=? AND published_at>=? AND published_at<=? ORDER BY published_at,id",
        args: [Number(isFixture), new Date(now.getTime() - ITEM_RETENTION_DAYS * DAY).toISOString(), now.toISOString()] },
    ], "read");
    const topicRecords = (results[0]?.rows ?? []).map(topicFromRow);
    const items = (results[1]?.rows ?? []).map(itemFromRow);
    return { topics: topicRecords.map(toDomainTopic), observations: toObservations(items, topicRecords), topicRecords, items };
  }

  async publish(inputTopics: Topic[], observations: Observation[], inputPulse: Pulse, owner: string, now = new Date(), options: PublishOptions = {}): Promise<{
    inserted: number; pulse: Pulse; runs: IngestionRun[]; pruned: Awaited<ReturnType<DataRepository["pruneOldData"]>>;
  }> {
    const template = pulseSchema.parse(inputPulse);
    if (!template.generatedAt) throw new Error("A persisted snapshot requires a collection timestamp");
    z.date().parse(now);
    const captured = new Date(template.generatedAt), capturedAt = captured.toISOString(), isFixture = template.mode === "demo";
    const topics = inputTopics.map((t) => topicSchema.parse(t));
    return writeTransaction(this.client, async (tx) => {
      const lease = await tx.execute({ sql: "SELECT owner FROM leases WHERE name='ingest' AND owner=? AND expires_at>?", args: [owner, now.getTime()] });
      if (!lease.rows.length) throw new Error("INGESTION_LEASE_EXPIRED");
      const existing = (await tx.execute({ sql: "SELECT * FROM topics WHERE is_fixture=?", args: [Number(isFixture)] })).rows.map(topicFromRow);
      const bySlug = new Map(existing.map((t) => [t.slug, t]));
      const proposed = (options.topicRecords ?? []).map((t) => topicRecordSchema.parse(t));
      for (const t of topics) {
        if (bySlug.has(t.slug)) continue;
        const supplied = proposed.find((r) => r.slug === t.slug);
        if (supplied && supplied.isFixture !== isFixture) throw new Error("TOPIC_DATASET_MISMATCH");
        const times = observations.filter((o) => o.topicSlug === t.slug).map((o) => o.publishedAt).sort();
        const record = supplied ?? topicRecordSchema.parse({ id: randomUUID(), slug: t.slug, canonicalLabel: t.title, category: t.category,
          neighborhood: null, firstSeenAt: times[0] ?? capturedAt, lastSeenAt: times.at(-1) ?? capturedAt,
          lifecycle: "inactive", pulseScore: 0, confidence: 0, summary: t.description, enrichmentMethod: t.method, isFixture });
        await tx.execute(topicInsert(record)); bySlug.set(t.slug, record);
      }
      // Resolve temporary classification IDs against stable persisted topic IDs.
      const proposedSlug = new Map(proposed.map((t) => [t.id, t.slug]));
      const incoming = options.items ?? observations.map((o) => {
        const topic = bySlug.get(o.topicSlug);
        if (!topic) throw new Error("ITEM_TOPIC_MISSING");
        return fromSignal(o, { topicId: topic.id, category: topic.category, neighborhood: o.neighborhood,
          localRelevance: 1, enrichmentStatus: "completed", isFixture });
      });
      const inserts = incoming.map((input) => {
        const item = itemRecordSchema.parse(input);
        if (item.isFixture !== isFixture) throw new Error("ITEM_DATASET_MISMATCH");
        const slug = item.topicId ? proposedSlug.get(item.topicId) : undefined;
        const topic = slug ? bySlug.get(slug) : undefined;
        return itemInsert(topic ? { ...item, topicId: topic.id, category: topic.category } : item);
      });
      const inserted = inserts.length ? (await tx.batch(inserts)).reduce((n, r) => n + r.rows.length, 0) : 0;
      await applyEnrichments(tx, options.enrichments ?? [], [...bySlug.values()], isFixture, captured);
      const rows = await tx.batch([
        { sql: `SELECT t.*,(SELECT s.count_24h FROM topic_snapshots s WHERE s.topic_id=t.id AND s.algorithm_version='v2'
          ORDER BY s.captured_at DESC LIMIT 1) AS last_count_24h FROM topics t WHERE t.is_fixture=? ORDER BY t.slug`, args: [Number(isFixture)] },
        { sql: "SELECT * FROM items WHERE is_fixture=? AND published_at>=? AND published_at<=? ORDER BY published_at,id",
          args: [Number(isFixture), new Date(captured.getTime() - ITEM_RETENTION_DAYS * DAY).toISOString(), capturedAt] },
      ]);
      const storedTopics = (rows[0]?.rows ?? []).map(topicFromRow);
      const lastCounts = new Map((rows[0]?.rows ?? []).map((r) => [String(r.id), r.last_count_24h]));
      const storedItems = (rows[1]?.rows ?? []).map(itemFromRow);
      const evidence = deduplicateEvidence(toObservations(storedItems, storedTopics), captured);
      const trends = computeTrends(storedTopics.map(toDomainTopic), evidence, captured);
      const metrics = new Map(evaluateTopics(storedTopics.map(toDomainTopic), evidence, captured).map((t) => [t.slug, t]));
      const pulse = pulseSchema.parse({ ...template, generatedAt: capturedAt, trends, hotspots: computeHotspots(trends, captured),
        totalSignals: evidence.filter((o) => Date.parse(o.publishedAt) >= captured.getTime() - 24 * HOUR).length });
      if (pulse.enrichment) {
        const recent = storedItems.filter((i) => Date.parse(i.publishedAt) >= captured.getTime() - DAY);
        pulse.enrichment = { ...pulse.enrichment, pending: recent.filter((i) => i.enrichmentStatus === "pending" || i.enrichmentStatus === "failed").length,
          completed: recent.filter((i) => i.enrichmentStatus === "completed").length, irrelevant: recent.filter((i) => i.enrichmentStatus === "irrelevant").length };
        if (pulse.enrichment.pending) {
          if (pulse.status === "healthy") pulse.status = "degraded";
          const message = `${pulse.enrichment.pending} collected signals await enrichment and are excluded from trend scores.`;
          pulse.notice = [pulse.notice, message].filter(Boolean).join(" ");
        }
        if (pulse.enrichment.provider === "off") pulse.notice = [pulse.notice, "Topic enrichment is disabled; collection continues safely."].filter(Boolean).join(" ");
      }
      const parent = await tx.execute({ sql: "INSERT INTO pulse_snapshots(id,captured_at,mode,payload) VALUES (?,?,?,?) ON CONFLICT(mode,captured_at) DO UPDATE SET payload=excluded.payload RETURNING id",
        args: [randomUUID(), capturedAt, pulse.mode, JSON.stringify(pulse)] });
      const batchId = String(parent.rows[0]!.id);
      if (pulse.enrichment?.run) {
        const report = enrichmentRunSchema.parse(pulse.enrichment.run);
        const enriched = options.enrichments ?? [];
        if (report.aiEnriched !== enriched.filter((a) => a.provider !== "heuristic").length ||
            report.heuristicEnriched !== enriched.filter((a) => a.provider === "heuristic").length) throw new Error("ENRICHMENT_RUN_COUNTER_MISMATCH");
        await tx.execute({ sql: `INSERT INTO enrichment_runs(id,pulse_snapshot_id,captured_at,mode,payload) VALUES (?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
          args: [options.runs?.[0]?.id ?? randomUUID(), batchId, capturedAt, pulse.mode, JSON.stringify(report)] });
      }
      const statements = [];
      for (const t of storedTopics) {
        const metric = metrics.get(t.slug)!;
        const items = storedItems.filter((i) => i.topicId === t.id);
        const times = items.map((i) => i.publishedAt).sort();
        const counts = new Map<string, number>();
        for (const o of evidence.filter((o) => o.topicSlug === t.slug && Date.parse(o.publishedAt) > captured.getTime() - 2 * HOUR))
          if (o.neighborhood) counts.set(o.neighborhood, (counts.get(o.neighborhood) ?? 0) + 1);
        const neighborhood = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? t.neighborhood;
        const state = metric.current2h ? metric.lifecycle : "inactive";
        statements.push({ sql: "UPDATE topics SET first_seen_at=min(first_seen_at,?),last_seen_at=max(last_seen_at,?),neighborhood=?,lifecycle=?,lifecycle_v2=?,pulse_score=?,confidence=? WHERE id=?",
          args: [times[0] ?? t.firstSeenAt, times.at(-1) ?? t.lastSeenAt, neighborhood, legacyLifecycle(state), state, metric.score, metric.confidence, t.id] });
        const topicEvidence = evidence.filter((o) => o.topicSlug === t.slug);
        // Record the final zero-evidence transition once, rather than writing
        // another identical archive row every poll for the next thirty days.
        if (metric.count24h > 0 || lastCounts.get(t.id) !== 0)
          statements.push(snapshotInsert(topicSnapshot(t.id, topicEvidence, captured, metric, batchId, toDomainTopic(t))));
      }
      const completedRuns: IngestionRun[] = [];
      for (const completion of options.runs ?? []) {
        const row = (await tx.execute({ sql: "SELECT * FROM ingestion_runs WHERE id=?", args: [completion.id] })).rows[0];
        if (!row) throw new Error("INGESTION_RUN_MISSING");
        const current = runFromRow(row), health = completion.health;
        if (current.status !== "running" || current.source !== health.source || current.isFixture !== isFixture) throw new Error("INGESTION_RUN_MISMATCH");
        const count = await tx.execute({ sql: "SELECT count(*) AS inserted FROM items WHERE ingestion_run_id=?", args: [current.id] });
        const run = ingestionRunSchema.parse({ ...current, finishedAt: now.toISOString(), discovered: health.fetched,
          inserted: Number(count.rows[0]!.inserted), duplicates: Math.max(0, health.accepted - Number(count.rows[0]!.inserted)),
          errors: health.rejected + (health.failedQueries ?? (health.status === "error" ? 1 : 0)),
          status: health.status === "error" ? "failed" : health.status === "partial" || health.rejected ? "partial" : "completed",
          errorMessage: health.error ?? (health.rejected ? "VALIDATION_REJECTED" : null) });
        completedRuns.push(run);
        statements.push({ sql: "UPDATE ingestion_runs SET finished_at=?,discovered=?,inserted=?,duplicates=?,errors=?,status=?,error_message=? WHERE id=?",
          args: [run.finishedAt, run.discovered, run.inserted, run.duplicates, run.errors, run.status, run.errorMessage, run.id] });
      }
      const results = await tx.batch([...statements, ...retentionStatements(now)]);
      const retention = results.slice(statements.length);
      return { inserted, pulse, runs: completedRuns, pruned: {
        items: retention[0]?.rowsAffected ?? 0, snapshots: retention[1]?.rowsAffected ?? 0,
        pulseSnapshots: retention[2]?.rowsAffected ?? 0, ingestionRuns: retention[3]?.rowsAffected ?? 0, topics: retention[4]?.rowsAffected ?? 0,
      } };
    });
  }

  async latest(mode: Pulse["mode"] = "live"): Promise<Pulse | null> {
    z.enum(["live", "demo"]).parse(mode);
    const result = await this.client.execute({ sql: "SELECT payload FROM pulse_snapshots WHERE mode=? ORDER BY captured_at DESC,rowid DESC LIMIT 1", args: [mode] });
    if (!result.rows[0]) return null;
    const parsed = storedPulseSchema.parse(JSON.parse(String(result.rows[0].payload)));
    if (parsed.version === "v2") return parsed;
    const data = await this.load(new Date(parsed.generatedAt ?? parsed.evaluatedAt), mode === "demo");
    return upgradeLegacyPulse(parsed, data.topics, data.observations);
  }
}
