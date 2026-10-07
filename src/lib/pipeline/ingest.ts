import "server-only";
import { sources, type Pulse, type SourceStatus } from "@/lib/domain/schema";
import { createAdapters, type SourceAdapter } from "@/lib/sources/adapters";
import { Repository } from "@/lib/db/repository";
import { getDatabase } from "@/lib/db/client";
import { fromSignal, toSignal } from "@/lib/db/mapping";
import { type IngestionRun } from "@/lib/db/records";
import { validateEnrichment, enrichmentTopicSchema, enrichmentProviderSchema, PRODUCTION_MODEL, editorialCategory, type EnrichmentTopic } from "@/lib/domain/enrichment";
import { getEnv } from "@/lib/server/env";
import { log } from "@/lib/server/logger";
import { deduplicate } from "./normalize";
import { classifyAI, type Classification } from "./ai";

type Options = {
  repository?: Repository; now?: Date; timeoutMs?: number;
  mode?: "live" | "demo";
  enrichmentMode?: "mock" | "openai" | "off";
  adapters?: Record<(typeof sources)[number], SourceAdapter>;
  enrich?: typeof classifyAI;
};
export async function ingest(options: Options = {}): Promise<{ skipped: boolean; added: number; pulse: Pulse | null }> {
  const now = options.now ?? new Date();
  const isFixture = options.mode === "demo";
  const repository = options.repository ?? new Repository(getDatabase());
  await repository.initialize();
  const lease = await repository.acquireLease(now);
  if (!lease) return { skipped: true, added: 0, pulse: null };
  const runs: IngestionRun[] = [];
  let health: SourceStatus[] = [];
  try {
    await repository.recoverInterruptedRuns(now);
    for (const source of sources) runs.push(await repository.startIngestionRun(source, now, isFixture));
    const existing = await repository.load(now, isFixture);
    const adapters = options.adapters ?? createAdapters();
    const timeout = options.timeoutMs ?? getEnv().SOURCE_TIMEOUT_MS;
    const results = await Promise.allSettled(sources.map((source) => adapters[source](now, timeout)));
    health = results.map((r, i) => r.status === "fulfilled" ? r.value.health : {
      source: sources[i]!, status: "error", fetched: 0, accepted: 0, rejected: 0, durationMs: 0, checkedAt: now.toISOString(), error: "SOURCE_UNAVAILABLE",
    });
    if (isFixture) health = health.map((s) => ({ ...s, status: s.status === "ok" ? "demo" : s.status }));
    const collected = results.flatMap((r) => r.status === "fulfilled" ? r.value.signals : []);
    const unique = deduplicate(isFixture ? collected.map((s) => ({ ...s, id: "fixture-" + s.id })) : collected, existing.items.map(toSignal));
    const topics = new Map(existing.topics.map((t) => [t.slug, t]));
    const records = new Map(existing.topicRecords.map((t) => [t.slug, t]));
    // Durable collection is independent of model availability and snapshot publication.
    const added = await repository.enrichment.collectPending(unique.map((signal) => fromSignal(signal, {
      ingestionRunId: runs.find((r) => r.source === signal.source)!.id, isFixture,
    })), lease, options.now ?? new Date());
    const env = getEnv();
    const enrichmentMode = options.enrichmentMode ?? env.ENRICHMENT_MODE;
    const catalog = await repository.enrichment.activeTopics(now, isFixture);
    const queue = (enrichmentMode === "off" || enrichmentMode === "openai" && !env.OPENAI_API_KEY) && !options.enrich ? []
      : await repository.enrichment.claimPending(now, isFixture, env.ENRICHMENT_MAX_ITEMS, lease);
    const candidates = queue.map(toSignal);
    let classifications = new Map<string, Classification>();
    try { if (candidates.length) classifications = await (options.enrich ?? classifyAI)(candidates, catalog, { mode: enrichmentMode }); }
    catch { log("warn", "enrichment.unavailable", { code: "ENRICHMENT_UNAVAILABLE" }); }
    const validatedCatalog: EnrichmentTopic[] = [...catalog];
    const assignments: Classification[] = [];
    for (const signal of candidates) {
      const match = classifications.get(signal.id);
      if (!match) continue;
      try {
        // Revalidate injected/provider results too; providers have no direct DB access.
        const result = validateEnrichment(match.result, signal, validatedCatalog);
        enrichmentProviderSchema.parse(match.provider);
        if (match.provider === "mock" ? match.model !== null : match.model !== PRODUCTION_MODEL) throw new Error("ENRICHMENT_PROVIDER_MODEL");
        if (result.confidence < (result.existing_topic_id ? 0.75 : 0.6)) continue;
        if (result.local_relevance < 0.5) { assignments.push({ ...match, result, topic: null }); continue; }
        const target = enrichmentTopicSchema.parse(match.topic);
        if (target.slug !== result.slug || target.canonical_label !== result.canonical_label || target.category !== result.category ||
            result.existing_topic_id && target.id !== result.existing_topic_id) throw new Error("ENRICHMENT_TOPIC_MISMATCH");
        let record = records.get(target.slug);
        if (record && (record.canonicalLabel !== target.canonical_label || record.category !== editorialCategory[target.category])) throw new Error("ENRICHMENT_TOPIC_COLLISION");
        const neighborhood = result.neighborhood === "Citywide" || result.neighborhood === "Unknown" ? null : result.neighborhood;
        if (!record) {
          record = { id: target.id, slug: target.slug, canonicalLabel: target.canonical_label, category: editorialCategory[target.category],
            neighborhood, firstSeenAt: signal.publishedAt, lastSeenAt: signal.publishedAt, lifecycle: "inactive", pulseScore: 0,
            confidence: 0, summary: result.summary, enrichmentMethod: match.provider === "openai" ? "ai" : "rules", isFixture };
          records.set(record.slug, record);
          topics.set(record.slug, { slug: record.slug, title: record.canonicalLabel, category: record.category, description: record.summary, method: record.enrichmentMethod });
        }
        const stable = { ...target, id: record.id };
        if (!validatedCatalog.some((t) => t.id === stable.id)) validatedCatalog.push(stable);
        assignments.push({ ...match, result, topic: stable });
      } catch { log("warn", "enrichment.result_rejected", { code: "ENRICHMENT_INVALID" }); }
    }
    const complete = health.filter((s) => s.status === "ok" || s.status === "demo").length;
    const available = health.filter((s) => s.status === "ok" || s.status === "demo" || s.status === "partial").length;
    const template: Pulse = {
      version: "v1", mode: isFixture ? "demo" : "live", generatedAt: now.toISOString(), evaluatedAt: now.toISOString(), stale: false,
      status: isFixture ? "demo" : complete === 3 ? "healthy" : available > 0 ? "degraded" : "unavailable",
      trends: [], hotspots: [], sources: health, totalSignals: 0,
      enrichment: { provider: assignments.length && assignments.every((a) => a.provider === "mock") ? "mock" : enrichmentMode, pending: 0, completed: 0, irrelevant: 0 },
      notice: isFixture ? "Fictional public-source fixtures. No live internet signals were collected." : complete === 3 ? null : available > 0 ? "Some source queries could not be completed. Momentum is based on the available evidence." : "All sources are currently unavailable. Previously collected evidence may still appear while it remains within the active window.",
    };
    if (template.enrichment?.provider === "mock") template.notice = [template.notice, "Semantic enrichment uses a local mock; no OpenAI requests or charges."].filter(Boolean).join(" ");
    if (assignments.length < candidates.length) {
      if (!isFixture && template.status === "healthy") template.status = "degraded";
      template.notice = [template.notice, "Some collected signals remain unenriched and are excluded from trend scores."].filter(Boolean).join(" ");
    }
    const result = await repository.publish([...topics.values()], [], template, lease, options.now ?? new Date(), {
      items: [], enrichments: assignments, topicRecords: [...records.values()], runs: runs.map((r, i) => ({ id: r.id, health: health[i]! })),
    });
    log("info", "ingest.completed", { added, ranked: result.pulse.trends.length, availableSources: available });
    return { skipped: false, added, pulse: result.pulse };
  } catch (error) {
    // Started runs survive failed publication; persist a terminal failure separately.
    for (const [i, run] of runs.entries()) {
      const status = health[i];
      try {
        const stored = await repository.client.execute({ sql: "SELECT count(*) AS count FROM items WHERE ingestion_run_id=?", args: [run.id] });
        const inserted = Number(stored.rows[0]!.count);
        await repository.completeIngestionRun(run.id, { finishedAt: (options.now ?? new Date()).toISOString(), discovered: status?.fetched ?? 0,
          inserted, duplicates: Math.max(0, (status?.accepted ?? 0) - inserted), errors: (status?.rejected ?? 0) + 1, status: "failed", errorMessage: "PUBLICATION_FAILED" });
      } catch { log("error", "ingest.run_failure", { source: run.source, code: "RUN_STATUS_WRITE_FAILED" }); }
    }
    throw error;
  } finally { await repository.releaseLease(lease); }
}
