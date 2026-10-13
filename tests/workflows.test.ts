import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { z } from "zod";

const step = z.object({ name: z.string().optional(), id: z.string().optional(), uses: z.string().optional(), run: z.string().optional(),
  if: z.string().optional(), env: z.record(z.string(), z.string()).optional(), "timeout-minutes": z.number().optional() });
const workflowSchema = z.object({ on: z.object({ schedule: z.array(z.object({ cron: z.string() })),
  workflow_dispatch: z.object({ inputs: z.object({ enrichment_provider: z.object({ default: z.string(), type: z.string(), options: z.array(z.string()) }),
    check_configuration: z.object({ default: z.boolean(), type: z.string() }) }) }) }),
  permissions: z.object({ contents: z.string() }), concurrency: z.object({ group: z.string(), "cancel-in-progress": z.boolean() }),
  jobs: z.object({ ingest: z.object({ "runs-on": z.string(), "timeout-minutes": z.number(), env: z.record(z.string(), z.string()).optional(), steps: z.array(step) }) }) });
const source = readFileSync(".github/workflows/ingest.yml", "utf8"), document = parseDocument(source);
const workflow = workflowSchema.parse(document.toJS());

describe("production ingestion workflow", () => {
  it("has valid YAML, manual dispatch and exactly the twice-hourly UTC schedule", () => {
    expect(document.errors).toEqual([]);
    expect(workflow.on.schedule).toEqual([{ cron: "17,47 * * * *" }]);
    expect(workflow.on.workflow_dispatch.inputs.enrichment_provider.type).toBe("choice");
  });
  it("serializes all production triggers without cancelling an active publication", () => {
    expect(workflow.concurrency.group).toBe("pulse-production-ingestion");
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.ingest["timeout-minutes"]).toBeLessThanOrEqual(10);
    for (const s of workflow.jobs.ingest.steps.filter((s) => s.uses)) expect(s.uses).toMatch(/^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
  });
  it("checks setup before dependency installation and gates collection on its explicit output", () => {
    const steps = workflow.jobs.ingest.steps, config = steps.find((s) => s.id === "configuration")!;
    expect(config.run).toBe("node scripts/check-ingestion-config.mjs");
    expect(config.env?.CHECK_CONFIGURATION).toBe("${{ inputs.check_configuration || 'false' }}");
    expect(steps.indexOf(config)).toBeLessThan(steps.findIndex((s) => s.uses?.startsWith("actions/setup-node@")));
    for (const s of steps.filter((s) => s.id === "ingest" || s.run === "npm ci" || s.uses?.startsWith("actions/setup-node@"))) {
      expect(s.if).toBe("steps.configuration.outputs.should_ingest == 'true'");
    }
    expect(workflow.on.workflow_dispatch.inputs.check_configuration).toEqual({ default: false, type: "boolean" });
  });
  it("scopes secrets to the setup check and real ingestion, which requires persistent remote storage", () => {
    const job = workflow.jobs.ingest, ingest = job.steps.find((s) => s.id === "ingest")!;
    expect(job.env).toBeUndefined();
    expect(ingest.run).toBe("npm run ingest -- --require-remote");
    expect(ingest["timeout-minutes"]).toBe(3);
    for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "OPENAI_API_KEY", "XKIRO_API_KEY"]) expect(ingest.env?.[name]).toBe("${{ secrets." + name + " }}");
    const config = job.steps.find((s) => s.id === "configuration")!;
    for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) expect(config.env?.[name]).toBe("${{ secrets." + name + " }}");
    expect(config.env).not.toHaveProperty("OPENAI_API_KEY"); expect(config.env).not.toHaveProperty("XKIRO_API_KEY");
    for (const s of job.steps.filter((s) => !["configuration", "ingest"].includes(s.id ?? ""))) expect(JSON.stringify(s)).not.toContain("secrets.");
    expect(source).not.toMatch(/printenv|set -x|continue-on-error|NEXT_PUBLIC_|ready=true/);
    expect(job.steps.some((s) => s.if === "failure()" && s.run?.includes("::error::"))).toBe(true);
  });
  it("selects xKiro for the intended deployment, keeps all three providers, and reads models and quotas from variables", () => {
    expect(workflow.on.workflow_dispatch.inputs.enrichment_provider).toMatchObject({ default: "xkiro", options: ["xkiro", "heuristic", "openai"] });
    const env = workflow.jobs.ingest.steps.find((s) => s.id === "ingest")!.env!;
    expect(env.ENRICHMENT_PROVIDER).toContain("vars.ENRICHMENT_PROVIDER || 'xkiro'");
    expect(env.MAX_AI_ITEMS_PER_RUN).toBe("${{ vars.MAX_AI_ITEMS_PER_RUN || '30' }}");
    expect(env.AI_BATCH_SIZE).toBe("${{ vars.AI_BATCH_SIZE || '10' }}"); expect(env.SOURCE_TIMEOUT_MS).toBe("8000");
    expect(env.XKIRO_MODEL).toBe("${{ vars.XKIRO_MODEL }}");
    expect(env.XKIRO_BASE_URL).toContain("https://api.xkiro.com/v1");
    expect(env.OPENAI_MODEL).toContain("vars.OPENAI_MODEL");
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
