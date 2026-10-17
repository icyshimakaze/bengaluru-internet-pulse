import "server-only";
import { z } from "zod";
import { sourceStatusSchema, type Source, type Signal } from "@/lib/domain/schema";
import { deduplicate } from "@/lib/pipeline/normalize";
import { errorCode, log } from "@/lib/server/logger";
import { withAbort, type Transport } from "./http";
import type { SourceAdapter, AdapterOptions } from "./types";

export type SourceQuery = { id: string; url: string; limit: number };
type Definition = { source: Source; queries: (now: Date) => SourceQuery[]; records: (payload: unknown) => unknown[];
  normalize: (record: unknown, now: Date) => Signal | null; concurrency?: number; minIntervalMs?: number };
export function collectSource(definition: Definition, transport: Transport, options: AdapterOptions = {}): SourceAdapter {
  const budgetMs = z.number().int().min(1).max(35000).parse(options.budgetMs ?? 35000);
  return async (now, timeoutMs) => {
    const started = Date.now(), deadline = AbortSignal.timeout(budgetMs);
    const queries = definition.queries(now);
    let next = 0, succeeded = 0, fetched = 0, accepted = 0, rejected = 0;
    let circuitCode: string | null = null;
    const failures: string[] = [], candidates: Signal[] = [];
    async function worker() {
      while (next < queries.length) {
        const query = queries[next++]!;
        const began = Date.now();
        try {
          if (circuitCode) throw new Error(circuitCode);
          deadline.throwIfAborted();
          const payload = await withAbort(transport(query.url, { timeoutMs, signal: deadline, source: definition.source,
            queryId: query.id, minIntervalMs: definition.minIntervalMs ?? 0 }), deadline);
          const raw = definition.records(payload);
          // A malformed upstream cannot bypass the advertised result cap.
          if (raw.length > query.limit) throw new Error("RESULT_LIMIT_EXCEEDED");
          fetched += raw.length;
          let invalid = 0;
          for (const record of raw) {
            let signal: Signal | null = null;
            try { signal = definition.normalize(record, now); }
            catch { /* Reject malformed records independently, never their valid siblings. */ }
            // Enforce the same exact 24h collection window for all providers.
            if (signal && Date.parse(signal.publishedAt) >= now.getTime() - 86400000) { candidates.push(signal); accepted++; }
            else { rejected++; invalid++; }
          }
          succeeded++;
          log("info", "source.query_completed", { source: definition.source, query: query.id, fetched: raw.length,
            accepted: raw.length - invalid, rejected: invalid, durationMs: Date.now() - began });
        } catch (error) {
          const code = errorCode(error); failures.push(code);
          // Respect provider throttling/access failures for the rest of this
          // poll. Other sources still run, and valid earlier results survive.
          if (["HTTP_429", "HTTP_401", "HTTP_403"].includes(code)) circuitCode = code;
          log("warn", "source.query_failed", { source: definition.source, query: query.id, code, durationMs: Date.now() - began });
        }
      }
    }
    // Bound per-provider concurrency while allowing all sources to run independently.
    await Promise.all(Array.from({ length: Math.min(definition.concurrency ?? 2, queries.length) }, worker));
    const signals = deduplicate(candidates);
    const health = sourceStatusSchema.parse({ source: definition.source, status: succeeded === 0 ? "error" : failures.length ? "partial" : "ok",
      fetched, accepted, rejected, duplicates: accepted - signals.length, queries: queries.length, failedQueries: failures.length,
      durationMs: Date.now() - started, checkedAt: now.toISOString(),
      ...(failures.length ? { error: succeeded ? "PARTIAL_QUERY_FAILURE" : failures[0] } : {}) });
    log(health.status === "ok" ? "info" : "warn", "source.completed", { source: definition.source, status: health.status,
      queries: queries.length, failedQueries: failures.length, fetched, accepted, rejected, duplicates: health.duplicates ?? 0,
      returned: signals.length, durationMs: health.durationMs });
    return { signals, health };
  };
}
