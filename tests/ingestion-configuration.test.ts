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
      OPENAI_API_KEY: "PRIVATE_KEY_SENTINEL", ...settings, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } });
  expect(run.error).toBeUndefined();
  expect(run.stdout + run.stderr).not.toMatch(/PRIVATE_KEY_SENTINEL|PRIVATE_TOKEN_SENTINEL|private\.turso\.io|source\.query/);
  return { ...run, output: readFileSync(output, "utf8"), summary: readFileSync(summary, "utf8") };
}

describe("ingestion workflow configuration bootstrap", () => {
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
