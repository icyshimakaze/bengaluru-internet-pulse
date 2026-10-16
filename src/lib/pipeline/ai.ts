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
import { validateBatch } from "@/lib/enrichment/validation";
export { ENRICHMENT_INSTRUCTIONS } from "@/lib/enrichment/prompt";

export type Classification = EnrichmentAssignment;
export type EnrichmentOptions = { provider?: EnrichmentProviderName; deadlineMs?: number; onReport?: (report: EnrichmentRun) => void };
function status(error: unknown): number | undefined {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : undefined;
}
function failureCode(error: unknown): string {
  if (error instanceof EnrichmentConfigurationError) return error.code;
  const http = status(error);
  if (http === 401) return "ENRICHMENT_AUTHENTICATION_FAILED";
  if (http === 403) return "ENRICHMENT_ACCESS_DENIED";
  if (http === 429) return "ENRICHMENT_RATE_LIMITED";
  if (http && http >= 500) return "ENRICHMENT_UPSTREAM_FAILED";
  if (error instanceof SyntaxError) return "ENRICHMENT_MALFORMED_JSON";
  if (error instanceof Error && ["TimeoutError", "AbortError", "APIConnectionTimeoutError"].includes(error.name)) return "ENRICHMENT_TIMEOUT";
  return "ENRICHMENT_INVALID_OR_UNAVAILABLE";
}
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
  const signals = input.slice(0, env.MAX_AI_ITEMS_PER_RUN).map((s) => signalSchema.parse(s));
  const catalog = inputCatalog.slice(0, 50).map((t) => enrichmentTopicSchema.parse(t));
  report.attempted = signals.length;
  const deadline = AbortSignal.timeout(Math.min(15000, Math.max(1, options.deadlineMs ?? 15000)));
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
        const requestDeadline = AbortSignal.any([deadline, AbortSignal.timeout(8000)]);
        try { items = validateBatch({ items: await provider.enrich(batch, catalog, { signal: requestDeadline }) }, batch, catalog); break; }
        catch (error) {
          report.providerErrors++;
          log("warn", "enrichment.provider_failed", { provider: selected, count: batch.length, attempt: attempt + 1, code: failureCode(error) });
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
      for (const item of valid) {
        if (item.confidence < (item.existing_topic_id ? 0.75 : 0.6)) continue;
        let topic = catalog.find((t) => t.id === item.existing_topic_id || t.slug === item.slug);
        if (item.local_relevance >= 0.5 && !topic) {
          topic = enrichmentTopicSchema.parse({ id: randomUUID(), slug: item.slug, canonical_label: item.canonical_label, category: item.category });
          catalog.push(topic);
        }
        result.set(item.signal_id, { result: item, topic: item.local_relevance >= 0.5 ? topic! : null, provider: actual.name, model: actual.model });
      }
    } catch {
      log("warn", "enrichment.batch_unprocessed", { provider: actual.name, count: batch.length, code: "ENRICHMENT_HEURISTIC_REJECTED" });
    }
  }
  report.actualProviders = [...new Set([...result.values()].map((a) => a.provider))];
  report.heuristicEnriched = [...result.values()].filter((a) => a.provider === "heuristic").length;
  report.aiEnriched = result.size - report.heuristicEnriched; report.unprocessed = signals.length - result.size;
  options.onReport?.(enrichmentRunSchema.parse(report));
  log("info", "enrichment.completed", { selectedProvider: selected, actualProviders: report.actualProviders.join(",") || "none",
    attempted: report.attempted, aiEnriched: report.aiEnriched, heuristicEnriched: report.heuristicEnriched,
    providerErrors: report.providerErrors, fallbackCount: report.fallbackCount, unprocessed: report.unprocessed });
  return result;
}
