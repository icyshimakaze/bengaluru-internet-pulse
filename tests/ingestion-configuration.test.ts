import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";

function check(event: string, settings: Record<string, string> = {}) {
  mkdirSync(".cache", { recursive: true });
  const directory = mkdtempSync(join(process.cwd(), ".cache", "workflow-config-"));
  const output = join(directory, "output"), summary = join(directory, "summary.md");
  const run = spawnSync(process.execPath, ["scripts/check-ingestion-config.mjs"], { encoding: "utf8", timeout: 5000,
    env: { ...process.env, GITHUB_EVENT_NAME: event, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", CHECK_CONFIGURATION: "false",
      AI_BATCH_SIZE: "10", MAX_AI_ITEMS_PER_RUN: "30",
      OPENAI_API_KEY: "PRIVATE_KEY_SENTINEL", ...settings, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } });
  expect(run.error).toBeUndefined();
  expect(run.stdout + run.stderr).not.toMatch(/PRIVATE_KEY_SENTINEL|PRIVATE_TOKEN_SENTINEL|private\.turso\.io|source\.query/);
  return { ...run, output: readFileSync(output, "utf8"), summary: readFileSync(summary, "utf8") };
}

describe("ingestion workflow configuration bootstrap", () => {
  it("rejects the production failure values before dependency installation or collection", () => {
    const run = check("schedule", { TURSO_DATABASE_URL: "libsql://private.turso.io", TURSO_AUTH_TOKEN: "PRIVATE_TOKEN_SENTINEL",
      AI_BATCH_SIZE: "20", MAX_AI_ITEMS_PER_RUN: "40" });
    expect(run.status).toBe(1); expect(run.output).toBe("should_ingest=false\n");
    expect(JSON.parse(run.stdout)).toMatchObject({ status: "invalid_configuration", invalid: ["AI_BATCH_SIZE", "MAX_AI_ITEMS_PER_RUN"] });
    expect(run.stderr).toContain("AI_BATCH_SIZE must be 1–10"); expect(run.stderr).toContain("MAX_AI_ITEMS_PER_RUN must be 1–30");
    expect(run.summary).toContain("**Worker limits:** Invalid");
  });
  it.each(["0", "11", "invalid", "2.5", " "])("rejects invalid batch limit %s without printing its value", (value) => {
    const run = check("schedule", { AI_BATCH_SIZE: value });
    expect(run.status).toBe(1); expect(run.output).toBe("should_ingest=false\n");
    expect(JSON.parse(run.stdout).invalid).toEqual(["AI_BATCH_SIZE"]);
  });
  it("fails a configuration-only check for invalid limits without requesting ingestion", () => {
    const run = check("workflow_dispatch", { CHECK_CONFIGURATION: "true", MAX_AI_ITEMS_PER_RUN: "40" });
    expect(run.status).toBe(1); expect(run.output).toBe("should_ingest=false\n");
    expect(JSON.parse(run.stdout)).toMatchObject({ operation: "check_only", invalid: ["MAX_AI_ITEMS_PER_RUN"] });
  });
  it("skips an unconfigured schedule honestly without installing or collecting", () => {
    const run = check("schedule");
    expect(run.status).toBe(0); expect(run.output).toBe("should_ingest=false\n");
    expect(run.stderr).toContain("::warning::");
    expect(run.summary).toContain("**Configuration:** Not configured");
    expect(run.summary).toContain("no public sources were polled");
    expect(run.summary).toContain("`TURSO_DATABASE_URL`"); expect(run.summary).toContain("`TURSO_AUTH_TOKEN`");
    expect(JSON.parse(run.stdout)).toMatchObject({ status: "not_configured", ingestion: "skipped" });
  });
  it("fails a manual production run with missing credentials", () => {
    const run = check("workflow_dispatch", { TURSO_DATABASE_URL: "libsql://private.turso.io", TURSO_AUTH_TOKEN: "  " });
    expect(run.status).toBe(1); expect(run.output).toBe("should_ingest=false\n");
    expect(run.stderr).toContain("::error::");
    expect(JSON.parse(run.stdout).missing).toEqual(["TURSO_AUTH_TOKEN"]);
  });
  it.each(["schedule", "workflow_dispatch"])("allows configured %s runs without implying a successful DB connection", (event) => {
    const run = check(event, { TURSO_DATABASE_URL: "libsql://private.turso.io", TURSO_AUTH_TOKEN: "PRIVATE_TOKEN_SENTINEL" });
    expect(run.status).toBe(0); expect(run.output).toBe("should_ingest=true\n");
    expect(run.stderr).toBe(""); expect(run.summary).toContain("does not verify database connectivity");
  });
  it.each([false, true])("checks configuration without collection even when configured=%s", (configured) => {
    const run = check("workflow_dispatch", { CHECK_CONFIGURATION: "true", ...(configured ? {
      TURSO_DATABASE_URL: "libsql://private.turso.io", TURSO_AUTH_TOKEN: "PRIVATE_TOKEN_SENTINEL",
    } : {}) });
    expect(run.status).toBe(0); expect(run.output).toBe("should_ingest=false\n");
    expect(run.summary).toContain("Configuration-only dispatch");
    expect(JSON.parse(run.stdout)).toMatchObject({ operation: "check_only", ingestion: "skipped" });
  });
});
