import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseIngestionArgs, requireRemoteDatabase, ingestionReport, failedIngestionReport, formatIngestionSummary } from "@/lib/server/ingestion-report";
import type { IngestionResult } from "@/lib/pipeline/ingest";
import { parseIngestionEnv } from "@/lib/server/ingestion-env";
import { now, pulse } from "./helpers";

function result(status: "healthy" | "degraded" | "unavailable" = "healthy"): IngestionResult {
  return { skipped: false, added: 4, pulse: pulse({ status, enrichment: { provider: "heuristic", pending: 0, completed: 4, irrelevant: 0 } }),
    runs: [{ id: "internal-run", source: "gdelt", startedAt: now.toISOString(), finishedAt: now.toISOString(),
      discovered: 7, inserted: 4, duplicates: 2, errors: 1, status: "partial", errorMessage: "SECRET_SOURCE_DIAGNOSTIC", isFixture: false }],
    pruned: { items: 2, snapshots: 3, pulseSnapshots: 1, ingestionRuns: 1, topics: 0 } };
}
describe("scheduled ingestion CLI contracts", () => {
  it("reports invalid worker field names and ranges without blaming the database or leaking values", () => {
    let error: unknown;
    try { parseIngestionEnv({ AI_BATCH_SIZE: "20", MAX_AI_ITEMS_PER_RUN: "40", ENRICHMENT_PROVIDER: "PRIVATE_KEY_SENTINEL" }); }
    catch (caught) { error = caught; }
    const report = failedIngestionReport(error, false, now), summary = formatIngestionSummary(report);
    expect(report.failureCode).toBe("INVALID_INGESTION_CONFIGURATION");
    expect(report.invalidVariables).toEqual(["ENRICHMENT_PROVIDER", "AI_BATCH_SIZE", "MAX_AI_ITEMS_PER_RUN"]);
    expect(summary).toContain("AI_BATCH_SIZE must be 1–10");
    expect(summary + JSON.stringify(report) + String(error)).not.toContain("PRIVATE_KEY_SENTINEL");
  });
  it("parses offline and production modes without allowing their combination", () => {
    expect(parseIngestionArgs(["--require-remote"])).toMatchObject({ requireRemote: true, fixtures: false });
    expect(parseIngestionArgs(["--fixtures"])).toMatchObject({ fixtures: true });
    expect(() => parseIngestionArgs(["--fixtures", "--require-remote"])).toThrow("INVALID_CLI_ARGUMENT");
    expect(() => parseIngestionArgs(["--secret=DO_NOT_PRINT"])).toThrow("INVALID_CLI_ARGUMENT");
  });
  it("rejects missing, malformed and ephemeral storage before starting source collection", () => {
    for (const url of [undefined, "file:.data/pulse.db", "http://example.org", "https:"]) expect(() => requireRemoteDatabase({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "test-token" })).toThrow("REMOTE_DATABASE_REQUIRED");
    expect(() => requireRemoteDatabase({ TURSO_DATABASE_URL: "libsql://example.turso.io" })).toThrow("REMOTE_DATABASE_REQUIRED");
    expect(() => requireRemoteDatabase({ TURSO_DATABASE_URL: "libsql://example.turso.io", TURSO_AUTH_TOKEN: "test-token" })).not.toThrow();
  });
  it("reports persisted counts and retention while omitting identifiers and raw diagnostics", () => {
    const report = ingestionReport(result(), false, now), summary = formatIngestionSummary(report);
    expect(report).toMatchObject({ status: "degraded", sources: [{ source: "gdelt", discovered: 7, inserted: 4, duplicates: 2, errors: 1 }], pruned: { items: 2, snapshots: 3 } });
    expect(summary).toContain("| gdelt | partial | 7 | 4 | 2 | 1 |");
    expect(summary).toContain("Heuristic matching is local and free");
    expect(summary + JSON.stringify(report)).not.toMatch(/SECRET_SOURCE_DIAGNOSTIC|internal-run/);
  });
  it("distinguishes completed storage with source/AI outages from failed storage and lease skips", () => {
    expect(ingestionReport(result("unavailable"), false, now)).toMatchObject({ status: "degraded", coverage: "unavailable", capturedAt: now.toISOString() });
    const data = result(); data.pulse!.enrichment!.pending = 4;
    expect(formatIngestionSummary(ingestionReport(data, false, now))).toContain("4 pending");
    const busy = ingestionReport({ skipped: true, added: 0, pulse: null, runs: [], pruned: null }, false, now);
    expect(busy).toMatchObject({ status: "skipped", coverage: null, sources: [], capturedAt: null });
    expect(formatIngestionSummary(busy)).toContain("another collector holds");
    const failed = failedIngestionReport(new Error("DATABASE_URL_TOKEN_SECRET"), false, now);
    expect(failed).toMatchObject({ status: "failed", failureCode: "INGEST_FAILED", added: null });
    expect(formatIngestionSummary(failed)).not.toContain("DATABASE_URL_TOKEN_SECRET");
  });
  it("fails the actual scheduled command with a safe job summary when secrets are missing", () => {
    mkdirSync(".cache", { recursive: true });
    const directory = mkdtempSync(join(process.cwd(), ".cache", "cli-summary-")), path = join(directory, "summary.md");
    const run = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/ingest.ts", "--require-remote"], {
      encoding: "utf8", timeout: 15000, env: { ...process.env, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "PRIVATE_TOKEN_SENTINEL",
        OPENAI_API_KEY: "PRIVATE_KEY_SENTINEL", ENRICHMENT_PROVIDER: "heuristic", GITHUB_ACTIONS: "true", GITHUB_STEP_SUMMARY: path },
    });
    expect(run.status).toBe(1); expect(run.error).toBeUndefined();
    expect(run.stderr).toContain("REMOTE_DATABASE_REQUIRED");
    expect(run.stdout + run.stderr).not.toMatch(/PRIVATE_TOKEN_SENTINEL|PRIVATE_KEY_SENTINEL|source\.query/);
    expect(readFileSync(path, "utf8")).toContain("**Outcome:** failed");
  }, 20000);
  it("fails the actual CLI with named invalid limits before database initialization or collection", () => {
    mkdirSync(".cache", { recursive: true });
    const directory = mkdtempSync(join(process.cwd(), ".cache", "cli-invalid-limits-")), path = join(directory, "summary.md");
    const run = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/ingest.ts", "--require-remote"], {
      encoding: "utf8", timeout: 15000, env: { ...process.env, TURSO_DATABASE_URL: "libsql://private.invalid", TURSO_AUTH_TOKEN: "PRIVATE_TOKEN_SENTINEL",
        AI_BATCH_SIZE: "20", MAX_AI_ITEMS_PER_RUN: "40", ENRICHMENT_PROVIDER: "heuristic", GITHUB_ACTIONS: "true", GITHUB_STEP_SUMMARY: path },
    });
    expect(run.status).toBe(1); expect(run.error).toBeUndefined();
    expect(run.stderr).toContain("INVALID_INGESTION_CONFIGURATION"); expect(run.stderr).toContain("AI_BATCH_SIZE");
    expect(run.stdout + run.stderr).not.toMatch(/PRIVATE_TOKEN_SENTINEL|private\.invalid|ingest\.started|ingest\.migrations|source\.query/);
    expect(readFileSync(path, "utf8")).toContain("**Invalid worker variables:**");
  }, 20000);
  it("fails visibly without starting sources when a configured database cannot migrate", () => {
    mkdirSync(".cache", { recursive: true });
    const directory = mkdtempSync(join(process.cwd(), ".cache", "cli-database-")), path = join(directory, "invalid.db");
    writeFileSync(path, "THIS_IS_NOT_A_DATABASE");
    const run = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/ingest.ts"], {
      encoding: "utf8", timeout: 15000, env: { ...process.env, TURSO_DATABASE_URL: "file:" + path.replaceAll("\\", "/"),
        TURSO_AUTH_TOKEN: "PRIVATE_TOKEN_SENTINEL", OPENAI_API_KEY: "PRIVATE_KEY_SENTINEL", ENRICHMENT_PROVIDER: "heuristic", GITHUB_STEP_SUMMARY: "" },
    });
    expect(run.status).toBe(1); expect(run.error).toBeUndefined();
    expect(run.stderr).toContain("INGEST_FAILED");
    expect(run.stdout + run.stderr).not.toMatch(/PRIVATE_TOKEN_SENTINEL|PRIVATE_KEY_SENTINEL|source\.query|THIS_IS_NOT_A_DATABASE/);
  }, 20000);
});
