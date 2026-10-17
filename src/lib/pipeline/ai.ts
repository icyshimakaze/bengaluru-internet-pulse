import "server-only";
import { randomUUID } from "node:crypto";
import { signalSchema, type Signal } from "@/lib/domain/schema";
import { enrichmentTopicSchema, type EnrichmentTopic, type EnrichmentAssignment, type EnrichmentResult } from "@/lib/domain/enrichment";
import { enrichmentProviderSchema, emptyEnrichmentRun, enrichmentRunSchema, type EnrichmentProviderName, type EnrichmentRun } from "@/lib/domain/enrichment-providers";
import { getIngestionEnv } from "@/lib/server/ingestion-env";
import { log } from "@/lib/server/logger";
import { withAbort } from "@/lib/sources/http";
import { getEnrichmentProvider } from "@/lib/enrichment/factory";
import { HeuristicEnrichmentProvider } from "@/lib/enrichment/heuristic";
import { EnrichmentConfigurationError, type EnrichmentProvider } from "@/lib/enrichment/types";
import { enrichmentDeadlines } from "@/lib/enrichment/limits";
import { enrichmentFailureCode, enrichmentHttpStatus as status } from "@/lib/enrichment/errors";
import { validateBatch } from "@/lib/enrichment/validation";
export { ENRICHMENT_INSTRUCTIONS } from "@/lib/enrichment/prompt";

export type Classification = EnrichmentAssignment;
export type EnrichmentOptions = { provider?: EnrichmentProviderName; deadlineMs?: number; onReport?: (report: EnrichmentRun) => void };
function transient(error: unknown): boolean {
  const http = status(error);
  return http !== undefined ? [408, 409].includes(http) || http >= 500 && http <= 599
    : error instanceof Error && ["APIConnectionError", "APIConnectionTimeoutError", "TypeError"].includes(error.name);
}

export async function classifyAI(input: Signal[], inputCatalog: EnrichmentTopic[], options: EnrichmentOptions = {}): Promise<Map<string, Classification>> {
  const result = new Map<string, Classification>();
  const env = getIngestionEnv(), selected = enrichmentProviderSchema.parse(options.provider ?? env.ENRICHMENT_PROVIDER);
  const report = emptyEnrichmentRun(selected);
  if (!input.length || !env.ENRICHMENT_ENABLED) { options.onReport?.(report); return result; }
  // The paid-provider cap must not starve the free local recovery queue.
  const signals = input.slice(0, selected === "heuristic" ? 500 : env.MAX_AI_ITEMS_PER_RUN).map((s) => signalSchema.parse(s));
  const catalog = inputCatalog.slice(0, 50).map((t) => enrichmentTopicSchema.parse(t));
  report.attempted = signals.length;
  const limits = enrichmentDeadlines(selected);
  const deadline = AbortSignal.timeout(Math.min(limits.stageMs, Math.max(1, options.deadlineMs ?? limits.stageMs)));
  const heuristic = new HeuristicEnrichmentProvider();
  let provider: EnrichmentProvider = heuristic;
  let unavailable = false;
  try { provider = getEnrichmentProvider(env, selected); }
  catch (error) {
    if (!(error instanceof EnrichmentConfigurationError)) throw error;
    unavailable = true; report.providerErrors++;
    log("warn", "enrichment.configuration_error", { selectedProvider: selected, code: error.code, fallback: "heuristic" });
  }
  for (let offset = 0; offset < signals.length; offset += env.AI_BATCH_SIZE) {
    const batch = signals.slice(offset, offset + env.AI_BATCH_SIZE);
    let actual = provider, items: EnrichmentResult[] | undefined;
    if (selected !== "heuristic" && (unavailable || deadline.aborted)) {
      if (!unavailable) {
        unavailable = true; report.providerErrors++;
        log("warn", "enrichment.provider_failed", { provider: selected, code: "ENRICHMENT_TIMEOUT", count: batch.length });
      }
      actual = heuristic; report.fallbackCount += batch.length;
    } else if (selected !== "heuristic") {
      for (let attempt = 0; attempt < 2; attempt++) {
        const requestDeadline = AbortSignal.any([deadline, AbortSignal.timeout(limits.requestMs)]);
        try { items = validateBatch({ items: await provider.enrich(batch, catalog, { signal: requestDeadline }) }, batch, catalog); break; }
        catch (error) {
          report.providerErrors++;
          log("warn", "enrichment.provider_failed", { provider: selected, model: provider.model, count: batch.length, attempt: attempt + 1,
            code: enrichmentFailureCode(error), httpStatus: status(error) ?? null });
          if (attempt === 0 && transient(error) && !requestDeadline.aborted) {
            try { await withAbort(new Promise<void>((resolve) => setTimeout(resolve, 250)), deadline); continue; } catch { /* Local fallback below. */ }
          }
          unavailable = [401, 403, 429].includes(status(error) ?? 0) || requestDeadline.aborted;
          actual = heuristic; report.fallbackCount += batch.length; break;
        }
      }
    }
    try {
      const valid = items ?? validateBatch({ items: await actual.enrich(batch, catalog, { signal: deadline }) }, batch, catalog);
      for (const proposed of valid) {
        let item = proposed, itemProvider = actual;
        if (item.confidence < (item.existing_topic_id ? 0.75 : 0.6) && actual.name !== "heuristic") {
          const source = batch.find((s) => s.id === item.signal_id)!;
          item = validateBatch({ items: await heuristic.enrich([source], catalog, { signal: deadline }) }, [source], catalog)[0]!;
          itemProvider = heuristic; report.fallbackCount++;
          log("info", "enrichment.low_confidence_recovered", { selectedProvider: selected, fallback: "heuristic", count: 1 });
        }
        if (item.confidence < (item.existing_topic_id ? 0.75 : 0.6)) continue;
        let topic = catalog.find((t) => t.id === item.existing_topic_id || t.slug === item.slug);
        if (item.local_relevance >= 0.5 && !topic) {
          topic = enrichmentTopicSchema.parse({ id: randomUUID(), slug: item.slug, canonical_label: item.canonical_label, category: item.category });
          catalog.push(topic);
        }
        result.set(item.signal_id, { result: item, topic: item.local_relevance >= 0.5 ? topic! : null, provider: itemProvider.name, model: itemProvider.model });
      }
    } catch {
      log("warn", "enrichment.batch_unprocessed", { provider: actual.name, count: batch.length, code: "ENRICHMENT_HEURISTIC_REJECTED" });
      if (actual.name === "heuristic" && batch.length > 1) {
        // Isolate an unprocessable item so it cannot hold valid siblings in
        // the local recovery queue. Single-item failures remain unresolved.
        for (const signal of batch) {
          const recovered = await classifyAI([signal], catalog, { provider: "heuristic" });
          const assignment = recovered.get(signal.id);
          if (!assignment) continue;
          result.set(signal.id, assignment);
          if (assignment.topic && !catalog.some((topic) => topic.id === assignment.topic!.id)) catalog.push(assignment.topic);
        }
      }
    }
  }
  report.actualProviders = [...new Set([...result.values()].map((a) => a.provider))];
  report.heuristicEnriched = [...result.values()].filter((a) => a.provider === "heuristic").length;
  report.aiEnriched = result.size - report.heuristicEnriched; report.unprocessed = signals.length - result.size;
  options.onReport?.(enrichmentRunSchema.parse(report));
  log("info", "enrichment.completed", { selectedProvider: selected, selectedModel: provider.model,
    actualProviders: report.actualProviders.join(",") || "none",
    attempted: report.attempted, aiEnriched: report.aiEnriched, heuristicEnriched: report.heuristicEnriched,
    providerErrors: report.providerErrors, fallbackCount: report.fallbackCount, unprocessed: report.unprocessed });
  return result;
}
