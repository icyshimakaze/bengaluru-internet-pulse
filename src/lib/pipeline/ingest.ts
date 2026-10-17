import "server-only";
import { sources, type Pulse, type SourceStatus } from "@/lib/domain/schema";
import { createAdapters, type SourceAdapter } from "@/lib/sources/adapters";
import { Repository } from "@/lib/db/repository";
import { getDatabase } from "@/lib/db/client";
import { fromSignal, toSignal } from "@/lib/db/mapping";
import { type IngestionRun } from "@/lib/db/records";
import { validateEnrichment, enrichmentTopicSchema, editorialCategory, type EnrichmentTopic } from "@/lib/domain/enrichment";
import { enrichmentProviderSchema, validProviderModel, emptyEnrichmentRun, enrichmentRunSchema, actualProvider, type EnrichmentProviderName } from "@/lib/domain/enrichment-providers";
import { getIngestionEnv, currentsEnabled } from "@/lib/server/ingestion-env";
import { log } from "@/lib/server/logger";
import { deduplicate } from "./normalize";
import { classifyAI, type Classification } from "./ai";
import { checkpointCollection } from "@/lib/db/collection-repository";

type Options = {
  repository?: Repository; now?: Date; timeoutMs?: number;
  mode?: "live" | "demo";
  enrichmentProvider?: EnrichmentProviderName;
  adapters?: Record<(typeof sources)[number], SourceAdapter>;
  enrich?: typeof classifyAI;
};
export type IngestionResult = { skipped: boolean; added: number; pulse: Pulse | null;
  runs: IngestionRun[]; pruned: Awaited<ReturnType<Repository["pruneOldData"]>> | null };
export async function ingest(options: Options = {}): Promise<IngestionResult> {
  // Reject invalid worker configuration before migrations, collection or writes.
  const env = getIngestionEnv();
  const now = options.now ?? new Date();
  const isFixture = options.mode === "demo";
  const configuredSources = sources.filter((source) => source !== "currents" || !isFixture && currentsEnabled(env));
  const repository = options.repository ?? new Repository(getDatabase());
  log("info", "ingest.started", { mode: isFixture ? "demo" : "live" });
  const migrations = await repository.initialize();
  log("info", "ingest.migrations", { applied: migrations.applied.length, version: migrations.version });
  const lease = await repository.acquireLease(now);
  if (!lease) { log("warn", "ingest.skipped", { code: "LEASE_BUSY" }); return { skipped: true, added: 0, pulse: null, runs: [], pruned: null }; }
  const runs: IngestionRun[] = [];
  let health: SourceStatus[] = [];
  try {
    await repository.recoverInterruptedRuns(now);
    for (const source of configuredSources) runs.push(await repository.startIngestionRun(source, now, isFixture));
    const existing = await repository.load(now, isFixture);
    const adapters = options.adapters ?? createAdapters(undefined, { currentsKey: env.CURRENTS_API_KEY });
    const timeout = options.timeoutMs ?? env.SOURCE_TIMEOUT_MS;
    const results = await Promise.allSettled(configuredSources.map((source) => adapters[source](now, timeout)));
    health = results.map((r, i) => r.status === "fulfilled" ? r.value.health : {
      source: configuredSources[i]!, status: "error", fetched: 0, accepted: 0, rejected: 0, durationMs: 0, checkedAt: now.toISOString(), error: "SOURCE_UNAVAILABLE",
    });
    if (isFixture) health = health.map((s) => ({ ...s, status: s.status === "ok" ? "demo" : s.status }));
    for (const [index, status] of health.entries()) {
      const result = results[index]!;
      await checkpointCollection(repository.client, status, result.status === "fulfilled" ? result.value.signals : [], isFixture, now);
    }
    const collected = results.flatMap((r) => r.status === "fulfilled" ? r.value.signals : []);
    const unique = deduplicate(isFixture ? collected.map((s) => ({ ...s, id: "fixture-" + s.id })) : collected, existing.items.map(toSignal));
    const topics = new Map(existing.topics.map((t) => [t.slug, t]));
    const records = new Map(existing.topicRecords.map((t) => [t.slug, t]));
    // Durable collection is independent of model availability and snapshot publication.
    const added = await repository.enrichment.collectPending(unique.map((signal) => fromSignal(signal, {
      ingestionRunId: runs.find((r) => r.source === signal.source)!.id, isFixture,
    })), lease, options.now ?? new Date());
    log("info", "ingest.collected", { returned: collected.length, unique: unique.length, inserted: added });
    const selected = isFixture ? "heuristic" : enrichmentProviderSchema.parse(options.enrichmentProvider ?? env.ENRICHMENT_PROVIDER);
    let enrichmentRun = emptyEnrichmentRun(selected);
    const catalog = await repository.enrichment.activeTopics(now, isFixture);
    const queue = !env.ENRICHMENT_ENABLED ? [] : await repository.enrichment.claimPending(options.now ?? new Date(), isFixture, env.MAX_AI_ITEMS_PER_RUN, lease);
    let candidates = queue.map(toSignal);
    let classifications = new Map<string, Classification>();
    try { if (candidates.length) classifications = await (options.enrich ?? classifyAI)(candidates, catalog, {
      provider: selected, onReport: (report) => { enrichmentRun = enrichmentRunSchema.parse(report); },
    }); }
    catch {
      log("warn", "enrichment.unavailable", { selectedProvider: selected, code: "ENRICHMENT_UNAVAILABLE", fallback: "heuristic" });
      // A provider/integration exception must not discard committed pending collection.
      try {
        classifications = await classifyAI(candidates, catalog, { provider: "heuristic" });
        enrichmentRun.providerErrors++; enrichmentRun.fallbackCount = candidates.length;
      } catch { log("warn", "enrichment.fallback_unavailable", { code: "ENRICHMENT_UNPROCESSED" }); }
    }
    if (env.ENRICHMENT_ENABLED) {
      const backlog = await repository.enrichment.pendingForRecovery(options.now ?? new Date(), isFixture, queue.map((item) => item.id));
      const missing = candidates.filter((signal) => !classifications.has(signal.id));
      const recovery = [...missing, ...backlog.map(toSignal)].slice(0, 500);
      if (recovery.length) {
        // No API client is involved. Exhausted retries and the per-run API cap
        // cannot strand processable source evidence indefinitely.
        const recoveryCatalog = [...catalog];
        for (const classification of classifications.values()) if (classification.topic && !recoveryCatalog.some((topic) => topic.slug === classification.topic!.slug)) recoveryCatalog.push(classification.topic);
        const recovered = await classifyAI(recovery, recoveryCatalog, { provider: "heuristic" });
        for (const [id, classification] of recovered) classifications.set(id, classification);
        candidates = [...candidates, ...backlog.map(toSignal).filter((signal) => recovery.some((item) => item.id === signal.id))];
        if (selected !== "heuristic") enrichmentRun.fallbackCount += recovered.size;
        log("info", "enrichment.pending_recovery", { considered: recovery.length, recovered: recovered.size,
          unresolved: recovery.length - recovered.size, provider: "heuristic" });
      }
    }
    const validatedCatalog: EnrichmentTopic[] = [...catalog];
    const assignments: Classification[] = [];
    for (const signal of candidates) {
      let match = classifications.get(signal.id);
      if (!match) continue;
      try {
        // A recovered proposal can name a topic outside the bounded provider
        // catalog. Resolve the same validated identity to its durable ID.
        const stableRecord = records.get(match.result.slug);
        if (stableRecord && match.topic && match.topic.slug === stableRecord.slug
          && match.topic.canonical_label === stableRecord.canonicalLabel
          && editorialCategory[match.topic.category] === stableRecord.category) {
          const stableTopic = { ...match.topic, id: stableRecord.id };
          if (!validatedCatalog.some((topic) => topic.id === stableTopic.id)) validatedCatalog.push(stableTopic);
          match = { ...match, topic: stableTopic, result: { ...match.result,
            existing_topic_id: match.result.existing_topic_id === match.topic.id ? stableRecord.id : match.result.existing_topic_id } };
        }
        // Revalidate injected/provider results too; providers have no direct DB access.
        const result = validateEnrichment(match.result, signal, validatedCatalog);
        enrichmentProviderSchema.parse(match.provider);
        if (!validProviderModel(match.provider, match.model)) throw new Error("ENRICHMENT_PROVIDER_MODEL");
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
            confidence: 0, summary: result.summary, enrichmentMethod: match.provider === "heuristic" ? "rules" : "ai", isFixture };
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
    enrichmentRun = enrichmentRunSchema.parse({ ...enrichmentRun, selectedProvider: selected, attempted: candidates.length,
      actualProviders: [...new Set(assignments.map((a) => a.provider))],
      aiEnriched: assignments.filter((a) => a.provider !== "heuristic").length,
      heuristicEnriched: assignments.filter((a) => a.provider === "heuristic").length,
      unprocessed: candidates.length - assignments.length });
    const template: Pulse = {
      version: "v2", mode: isFixture ? "demo" : "live", generatedAt: now.toISOString(), evaluatedAt: now.toISOString(), stale: false,
      status: isFixture ? "demo" : complete === configuredSources.length ? "healthy" : available > 0 ? "degraded" : "unavailable",
      trends: [], hotspots: [], sources: health, totalSignals: 0,
      enrichment: { provider: actualProvider(enrichmentRun), run: enrichmentRun, pending: 0, completed: 0, irrelevant: 0 },
      notice: isFixture ? "Fictional public-source fixtures. No live internet signals were collected." : complete === configuredSources.length ? null : available > 0 ? "Some source queries could not be completed. Momentum is based on the available evidence." : "All sources are currently unavailable. Previously collected evidence may still appear while it remains within the active window.",
    };
    if (enrichmentRun.heuristicEnriched) template.notice = [template.notice, `${enrichmentRun.heuristicEnriched} signals used deterministic heuristic topic matching.`].filter(Boolean).join(" ");
    if (enrichmentRun.fallbackCount) {
      if (!isFixture && template.status === "healthy") template.status = "degraded";
      template.notice = [template.notice, enrichmentRun.providerErrors
        ? `${selected} enrichment was unavailable; ${enrichmentRun.fallbackCount} signals used local heuristic fallback.`
        : `${enrichmentRun.fallbackCount} signals used local heuristic recovery outside the API budget or confidence threshold.`].filter(Boolean).join(" ");
    }
    if (!env.ENRICHMENT_ENABLED) template.notice = [template.notice, "Topic enrichment is disabled; collection continues safely."].filter(Boolean).join(" ");
    if (assignments.length < candidates.length) {
      if (!isFixture && template.status === "healthy") template.status = "degraded";
      template.notice = [template.notice, "Some collected signals remain unenriched and are excluded from trend scores."].filter(Boolean).join(" ");
    }
    const result = await repository.publish([...topics.values()], [], template, lease, options.now ?? new Date(), {
      items: [], enrichments: assignments, topicRecords: [...records.values()], runs: runs.map((r, i) => ({ id: r.id, health: health[i]! })),
    });
    for (const run of result.runs) log(run.status === "completed" ? "info" : "warn", "ingest.source_summary", {
      source: run.source, status: run.status, discovered: run.discovered, inserted: run.inserted, duplicates: run.duplicates, errors: run.errors,
    });
    log("info", "ingest.completed", { status: result.pulse.status, added, ranked: result.pulse.trends.length, availableSources: available,
      selectedProvider: selected, actualProviders: enrichmentRun.actualProviders.join(",") || "none",
      aiEnriched: enrichmentRun.aiEnriched, heuristicEnriched: enrichmentRun.heuristicEnriched,
      providerErrors: enrichmentRun.providerErrors, fallbackCount: enrichmentRun.fallbackCount, pending: result.pulse.enrichment?.pending ?? 0,
      prunedItems: result.pruned.items, prunedSnapshots: result.pruned.snapshots, prunedPulseSnapshots: result.pruned.pulseSnapshots,
      prunedRuns: result.pruned.ingestionRuns, prunedTopics: result.pruned.topics });
    return { skipped: false, added, pulse: result.pulse, runs: result.runs, pruned: result.pruned };
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
