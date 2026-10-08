import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { z } from "zod";

const step = z.object({ name: z.string().optional(), id: z.string().optional(), uses: z.string().optional(), run: z.string().optional(),
  if: z.string().optional(), env: z.record(z.string(), z.string()).optional(), "timeout-minutes": z.number().optional() });
const workflowSchema = z.object({ on: z.object({ schedule: z.array(z.object({ cron: z.string() })),
  workflow_dispatch: z.object({ inputs: z.object({ enrichment_mode: z.object({ default: z.string(), type: z.string(), options: z.array(z.string()) }) }) }) }),
  permissions: z.object({ contents: z.string() }), concurrency: z.object({ group: z.string(), "cancel-in-progress": z.boolean() }),
  jobs: z.object({ ingest: z.object({ "runs-on": z.string(), "timeout-minutes": z.number(), env: z.record(z.string(), z.string()).optional(), steps: z.array(step) }) }) });
const source = readFileSync(".github/workflows/ingest.yml", "utf8"), document = parseDocument(source);
const workflow = workflowSchema.parse(document.toJS());

describe("production ingestion workflow", () => {
  it("has valid YAML, manual dispatch and exactly the twice-hourly UTC schedule", () => {
    expect(document.errors).toEqual([]);
    expect(workflow.on.schedule).toEqual([{ cron: "17,47 * * * *" }]);
    expect(workflow.on.workflow_dispatch.inputs.enrichment_mode.type).toBe("choice");
  });
  it("serializes all production triggers without cancelling an active publication", () => {
    expect(workflow.concurrency.group).toBe("pulse-production-ingestion");
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.ingest["timeout-minutes"]).toBeLessThanOrEqual(10);
    for (const s of workflow.jobs.ingest.steps.filter((s) => s.uses)) expect(s.uses).toMatch(/^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
  });
  it("passes secrets only to the real ingestion command, which requires persistent remote storage", () => {
    const job = workflow.jobs.ingest, ingest = job.steps.find((s) => s.id === "ingest")!;
    expect(job.env).toBeUndefined(); expect(ingest.if).toBeUndefined();
    expect(ingest.run).toBe("npm run ingest -- --require-remote");
    expect(ingest["timeout-minutes"]).toBe(3);
    for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "OPENAI_API_KEY"]) expect(ingest.env?.[name]).toBe("${{ secrets." + name + " }}");
    for (const s of job.steps.filter((s) => s.id !== "ingest")) expect(JSON.stringify(s)).not.toContain("secrets.");
    expect(source).not.toMatch(/printenv|set -x|continue-on-error|NEXT_PUBLIC_|ready=true/);
    expect(job.steps.some((s) => s.if === "failure()" && s.run?.includes("::error::"))).toBe(true);
  });
  it("defaults to free mock matching with bounded enrichment and allows explicit provider selection", () => {
    expect(workflow.on.workflow_dispatch.inputs.enrichment_mode).toMatchObject({ default: "mock", options: ["mock", "openai", "off"] });
    const env = workflow.jobs.ingest.steps.find((s) => s.id === "ingest")!.env!;
    expect(env.ENRICHMENT_MODE).toContain("|| 'mock'");
    expect(env.ENRICHMENT_MAX_ITEMS).toBe("30"); expect(env.ENRICHMENT_BATCH_SIZE).toBe("10"); expect(env.SOURCE_TIMEOUT_MS).toBe("8000");
  });
  it("validates workflow syntax in CI and has no dependency on Vercel cron", () => {
    const ci = parseDocument(readFileSync(".github/workflows/ci.yml", "utf8"));
    expect(ci.errors).toEqual([]);
    const config = z.object({ jobs: z.object({ verify: z.object({ steps: z.array(step) }) }) }).parse(ci.toJS());
    expect(config.jobs.verify.steps.some((s) => s.uses === "docker://rhysd/actionlint:1.7.12")).toBe(true);
    expect(JSON.parse(readFileSync("vercel.json", "utf8"))).not.toHaveProperty("crons");
    expect(source).not.toContain("CRON_SECRET"); expect(source).not.toContain("VERCEL");
  });
});
