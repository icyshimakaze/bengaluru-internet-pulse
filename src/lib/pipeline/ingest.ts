import "server-only";
import { randomUUID } from "node:crypto";
import { sources, type Pulse, type SourceStatus, type Observation, type Topic } from "@/lib/domain/schema";
import { createAdapters, type SourceAdapter } from "@/lib/sources/adapters";
import { Repository } from "@/lib/db/repository";
import { getDatabase } from "@/lib/db/client";
import { fromSignal, toSignal } from "@/lib/db/mapping";
import { type ItemRecord, type IngestionRun } from "@/lib/db/records";
import { getEnv } from "@/lib/server/env";
import { log } from "@/lib/server/logger";
import { deduplicate, isBengaluruRelevant } from "./normalize";
import { classifyLocal, topicRules } from "./topics";
import { classifyAI, type Classification } from "./ai";

type Options = {
  repository?: Repository; now?: Date; timeoutMs?: number;
  adapters?: Record<(typeof sources)[number], SourceAdapter>;
  ai?: (signals: Parameters<typeof classifyAI>[0], topics: Topic[]) => Promise<Map<string, Classification | null>>;
};
export async function ingest(options: Options = {}): Promise<{ skipped: boolean; added: number; pulse: Pulse | null }> {
  const now = options.now ?? new Date();
  const repository = options.repository ?? new Repository(getDatabase());
  await repository.initialize();
  const lease = await repository.acquireLease(now);
  if (!lease) return { skipped: true, added: 0, pulse: null };
  const runs: IngestionRun[] = [];
  let health: SourceStatus[] = [];
  try {
    await repository.recoverInterruptedRuns(now);
    for (const source of sources) runs.push(await repository.startIngestionRun(source, now));
    const existing = await repository.load(now);
    const adapters = options.adapters ?? createAdapters();
    const timeout = options.timeoutMs ?? getEnv().SOURCE_TIMEOUT_MS;
    const results = await Promise.allSettled(sources.map((source) => adapters[source](now, timeout)));
    health = results.map((r, i) => r.status === "fulfilled" ? r.value.health : {
      source: sources[i]!, status: "error", fetched: 0, accepted: 0, rejected: 0, durationMs: 0, checkedAt: now.toISOString(), error: "SOURCE_UNAVAILABLE",
    });
    const unique = deduplicate(results.flatMap((r) => r.status === "fulfilled" ? r.value.signals : []), existing.items.map(toSignal));
    const candidates = unique.filter((s) => isBengaluruRelevant(s.text));
    const topics = new Map(existing.topics.map((t) => [t.slug, t]));
    const records = new Map(existing.topicRecords.map((t) => [t.slug, t]));
    const catalog = [...topics.values(), ...topicRules.filter((t) => !topics.has(t.slug)).map(({ pattern: _pattern, ...t }) => { void _pattern; return t; })];
    let ai = new Map<string, Classification | null>();
    try { ai = await (options.ai ?? classifyAI)(candidates, catalog); }
    catch { log("warn", "canonicalization.fallback", { code: "AI_UNAVAILABLE" }); }
    const additions: Observation[] = [];
    const items: ItemRecord[] = [];
    for (const signal of unique) {
      const run = runs.find((r) => r.source === signal.source)!;
      if (!isBengaluruRelevant(signal.text)) {
        items.push(fromSignal(signal, { ingestionRunId: run.id, enrichmentStatus: "irrelevant" }));
        continue;
      }
      const match = ai.has(signal.id) ? ai.get(signal.id) : classifyLocal(signal, [...topics.values()]);
      if (!match) {
        const irrelevant = ai.has(signal.id);
        items.push(fromSignal(signal, { ingestionRunId: run.id, localRelevance: irrelevant ? 0 : 1, enrichmentStatus: irrelevant ? "irrelevant" : "pending" }));
        continue;
      }
      if (!topics.has(match.topic.slug)) topics.set(match.topic.slug, match.topic);
      let record = records.get(match.topic.slug);
      if (!record) {
        record = { id: randomUUID(), slug: match.topic.slug, canonicalLabel: match.topic.title, category: match.topic.category,
          neighborhood: match.neighborhood, firstSeenAt: signal.publishedAt, lastSeenAt: signal.publishedAt, lifecycle: "inactive",
          pulseScore: 0, confidence: 0, summary: match.topic.description, enrichmentMethod: match.topic.method, isFixture: false };
        records.set(record.slug, record);
      }
      additions.push({ ...signal, topicSlug: match.topic.slug, neighborhood: match.neighborhood });
      items.push(fromSignal(signal, { topicId: record.id, category: record.category, neighborhood: match.neighborhood,
        localRelevance: 1, enrichmentStatus: "completed", ingestionRunId: run.id }));
    }
    const available = health.filter((s) => s.status === "ok").length;
    const template: Pulse = {
      version: "v1", mode: "live", generatedAt: now.toISOString(), evaluatedAt: now.toISOString(), stale: false,
      status: available === 3 ? "healthy" : available > 0 ? "degraded" : "unavailable",
      trends: [], hotspots: [], sources: health, totalSignals: 0,
      notice: available === 3 ? null : available > 0 ? "Some sources could not be reached. Momentum is based on the available evidence." : "All sources are currently unavailable. Previously collected evidence may still appear while it remains within the active window.",
    };
    const result = await repository.publish([...topics.values()], additions, template, lease, options.now ?? new Date(), {
      items, topicRecords: [...records.values()], runs: runs.map((r, i) => ({ id: r.id, health: health[i]! })),
    });
    log("info", "ingest.completed", { added: result.inserted, ranked: result.pulse.trends.length, availableSources: available });
    return { skipped: false, added: result.inserted, pulse: result.pulse };
  } catch (error) {
    // Started runs survive failed publication; persist a terminal failure separately.
    for (const [i, run] of runs.entries()) {
      const status = health[i];
      try {
        await repository.completeIngestionRun(run.id, { finishedAt: (options.now ?? new Date()).toISOString(), discovered: status?.fetched ?? 0,
          inserted: 0, duplicates: 0, errors: (status?.rejected ?? 0) + 1, status: "failed", errorMessage: "PUBLICATION_FAILED" });
      } catch { log("error", "ingest.run_failure", { source: run.source, code: "RUN_STATUS_WRITE_FAILED" }); }
    }
    throw error;
  } finally { await repository.releaseLease(lease); }
}
