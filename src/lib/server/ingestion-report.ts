import "server-only";
import { IngestionEnvironmentError, ingestionVariableNames } from "./ingestion-env";
import { z } from "zod";
import { sourceSchema, pulseSchema } from "@/lib/domain/schema";
import type { IngestionResult } from "@/lib/pipeline/ingest";

const count = z.number().int().nonnegative();
export const ingestionReportSchema = z.object({
  event: z.enum(["cli.ingest", "cli.ingest.failed"]), at: z.iso.datetime(),
  status: z.enum(["completed", "degraded", "skipped", "failed"]), mode: z.enum(["demo", "live"]),
  coverage: pulseSchema.shape.status.nullable(), capturedAt: z.iso.datetime().nullable(),
  added: count.nullable(), rankedTopics: count.nullable(), availableSources: count.max(3).nullable(),
  enrichment: pulseSchema.shape.enrichment.unwrap().nullable(),
  sources: z.array(z.object({ source: sourceSchema, status: z.enum(["completed", "partial", "failed", "abandoned"]),
    discovered: count, inserted: count, duplicates: count, errors: count }).strict()).max(3),
  pruned: z.object({ items: count, snapshots: count, pulseSnapshots: count, ingestionRuns: count, topics: count }).strict().nullable(),
  failureCode: z.enum(["INVALID_CLI_ARGUMENT", "REMOTE_DATABASE_REQUIRED", "INVALID_INGESTION_CONFIGURATION", "INGEST_FAILED"]).nullable(),
  invalidVariables: z.array(z.enum(ingestionVariableNames)).default([]),
}).strict();
export type IngestionReport = z.infer<typeof ingestionReportSchema>;

export function parseIngestionArgs(args: string[]) {
  const result = z.array(z.enum(["--fixtures", "--help", "--require-remote"])).safeParse(args);
  if (!result.success || args.includes("--fixtures") && args.includes("--require-remote")) throw new Error("INVALID_CLI_ARGUMENT");
  return { fixtures: args.includes("--fixtures"), help: args.includes("--help"), requireRemote: args.includes("--require-remote") };
}

/** Scheduled runners must never silently persist to an ephemeral local file. */
export function requireRemoteDatabase(env: Record<string, string | undefined>) {
  try {
    const url = new URL(env.TURSO_DATABASE_URL ?? "");
    if (!["libsql:", "https:"].includes(url.protocol) || !url.hostname || !env.TURSO_AUTH_TOKEN?.trim()) throw new Error();
  } catch { throw new Error("REMOTE_DATABASE_REQUIRED"); }
}

/** Allowlist fields rather than forwarding source errors, database records or environment values. */
export function ingestionReport(result: IngestionResult, fixtureMode = false, now = new Date()): IngestionReport {
  const pulse = result.pulse;
  const degraded = pulse?.status === "degraded" || pulse?.status === "unavailable" || !!pulse?.enrichment?.pending || !!pulse?.enrichment?.run?.fallbackCount
    || result.runs.some((r) => r.status !== "completed");
  return ingestionReportSchema.parse({ event: "cli.ingest", at: now.toISOString(),
    status: result.skipped ? "skipped" : degraded ? "degraded" : "completed", mode: pulse?.mode ?? (fixtureMode ? "demo" : "live"),
    coverage: pulse?.status ?? null, capturedAt: pulse?.generatedAt ?? null, added: result.added,
    rankedTopics: pulse?.trends.length ?? null,
    availableSources: pulse ? pulse.sources.filter((s) => ["ok", "partial", "demo"].includes(s.status)).length : null,
    enrichment: pulse?.enrichment ?? null,
    sources: result.runs.map(({ source, status, discovered, inserted, duplicates, errors }) => ({ source, status, discovered, inserted, duplicates, errors })),
    pruned: result.pruned, failureCode: null });
}

export function failedIngestionReport(error: unknown, fixtureMode = false, now = new Date()): IngestionReport {
  const message = error instanceof Error ? error.message : "";
  const code = error instanceof IngestionEnvironmentError ? "INVALID_INGESTION_CONFIGURATION"
    : message === "INVALID_CLI_ARGUMENT" || message === "REMOTE_DATABASE_REQUIRED" ? message : "INGEST_FAILED";
  return ingestionReportSchema.parse({ event: "cli.ingest.failed", at: now.toISOString(), status: "failed", mode: fixtureMode ? "demo" : "live",
    coverage: null, capturedAt: null, added: null, rankedTopics: null, availableSources: null, enrichment: null, sources: [], pruned: null, failureCode: code,
    invalidVariables: error instanceof IngestionEnvironmentError ? error.fields : [] });
}

export function formatIngestionSummary(input: IngestionReport): string {
  const r = ingestionReportSchema.parse(input);
  const lines = ["## Bengaluru Pulse ingestion", "", `**Outcome:** ${r.status} · **Mode:** ${r.mode} · **Coverage:** ${r.coverage ?? "not evaluated"}`,
    `**Snapshot:** ${r.capturedAt ?? (r.status === "skipped" ? "not written; another collector holds the database lease" : "not confirmed")}`,
    `**Inserted:** ${r.added ?? "unknown"} · **Ranked topics:** ${r.rankedTopics ?? "not evaluated"} · **Available sources:** ${r.availableSources ?? "not evaluated"}`, ""];
  if (r.invalidVariables.length) lines.push(`**Invalid worker variables:** ${r.invalidVariables.map((name) => "`" + name + "`").join(", ")}.`,
    "AI_BATCH_SIZE must be 1–10; MAX_AI_ITEMS_PER_RUN must be 1–30. Check Settings → Secrets and variables → Actions → Variables.", "");
  if (r.sources.length) lines.push("| Source | Status | Discovered | Inserted | Duplicates | Errors |", "| --- | --- | ---: | ---: | ---: | ---: |",
    ...r.sources.map((s) => `| ${s.source} | ${s.status} | ${s.discovered} | ${s.inserted} | ${s.duplicates} | ${s.errors} |`), "");
  if (r.enrichment) lines.push(`**Enrichment:** ${r.enrichment.provider} · ${r.enrichment.completed} completed · ${r.enrichment.pending} pending · ${r.enrichment.irrelevant} irrelevant (latest 24h).`,
    r.enrichment.provider === "heuristic" ? "Heuristic matching is local and free. This does not imply the selected API provider succeeded." : "Unenriched collected signals remain stored and do not contribute to trend scores.", "");
  if (r.enrichment?.run) {
    const e = r.enrichment.run;
    lines.push(`**This run:** selected ${e.selectedProvider}; actually processed by ${e.actualProviders.join(", ") || "none"}.`,
      `**Processed:** ${e.aiEnriched} API-enriched · ${e.heuristicEnriched} heuristic-enriched · ${e.unprocessed} unprocessed.`,
      `**Provider errors:** ${e.providerErrors} · **Fallback signals:** ${e.fallbackCount}.`, "");
  }
  if (r.pruned) lines.push(`**Retention pruned:** ${r.pruned.items} items, ${r.pruned.snapshots} topic snapshots, ${r.pruned.pulseSnapshots} dashboard snapshots, ${r.pruned.ingestionRuns} source runs, ${r.pruned.topics} unreferenced topics.`, "");
  if (r.status === "degraded") lines.push("Collection/publication completed with reduced coverage or pending enrichment. Inspect source counts; collected evidence is retained.", "");
  if (r.failureCode) lines.push(`**Failure:** ${r.failureCode}. Check required remote database configuration and connectivity. Previously committed evidence is retained.`, "");
  return lines.join("\n") + "\n";
}
