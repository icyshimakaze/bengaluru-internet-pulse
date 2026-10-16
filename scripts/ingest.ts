import "./env";
import { createClient, type Client } from "@libsql/client";
import { appendFileSync, mkdirSync } from "node:fs";
import { ingest } from "../src/lib/pipeline/ingest";
import { getDatabase } from "../src/lib/db/client";
import { getIngestionEnv } from "../src/lib/server/ingestion-env";
import { Repository } from "../src/lib/db/repository";
import { createAdapters } from "../src/lib/sources/adapters";
import { FIXTURE_NOW } from "../src/fixtures/demo";
import fixtures from "../src/fixtures/public-sources.json";
import { parseIngestionArgs, requireRemoteDatabase, ingestionReport, failedIngestionReport, formatIngestionSummary, type IngestionReport } from "../src/lib/server/ingestion-report";

let client: Client | undefined;
let fixtureMode = false;
function writeSummary(report: IngestionReport) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatIngestionSummary(report));
}
try {
  const args = parseIngestionArgs(process.argv.slice(2));
  fixtureMode = args.fixtures;
  if (args.help) {
    console.info("Usage: npm run ingest [-- --fixtures | --require-remote]\nLive: configured Turso database or local .data/pulse.db.\nScheduled: --require-remote requires a remote database URL and token.\nFixtures: offline fictional signals in isolated .data/ingestion-fixtures.db.");
  } else {
    if (args.requireRemote) requireRemoteDatabase(process.env);
    getIngestionEnv();
    if (fixtureMode) {
      mkdirSync(".data", { recursive: true });
      client = createClient({ url: "file:.data/ingestion-fixtures.db" });
    } else {
      if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = "file:.data/pulse.db";
      client = getDatabase();
    }
    const adapters = fixtureMode ? createAdapters(async (url) => {
      const host = new URL(url).hostname;
      return host === "api.gdeltproject.org" ? fixtures.gdelt : host === "api.bsky.app" ? fixtures.bluesky : fixtures.hackernews;
    }) : undefined;
    const result = await ingest({ repository: new Repository(client), ...(fixtureMode ? {
      mode: "demo", enrichmentProvider: "heuristic", now: FIXTURE_NOW, timeoutMs: 1000, adapters,
    } : {}) });
    const report = ingestionReport(result, fixtureMode);
    console.info(JSON.stringify(report));
    writeSummary(report);
    // Upstream outages are recorded degraded runs. Storage/publication errors throw and fail below.
    if (report.status === "degraded" && process.env.GITHUB_ACTIONS === "true") console.warn("::warning::Ingestion published with reduced source coverage or pending enrichment. See the source-count summary.");
  }
} catch (error) {
  const report = failedIngestionReport(error, fixtureMode);
  console.error(JSON.stringify(report));
  if (process.env.GITHUB_ACTIONS === "true") console.error(report.failureCode === "INVALID_INGESTION_CONFIGURATION"
    ? `::error::Invalid worker configuration: ${report.invalidVariables.join(", ")}. AI_BATCH_SIZE must be 1–10; MAX_AI_ITEMS_PER_RUN must be 1–30.`
    : "::error::Ingestion failed. Check remote database configuration, migrations and connectivity.");
  try { writeSummary(report); } catch { console.error(JSON.stringify({ event: "cli.summary.failed", code: "SUMMARY_WRITE_FAILED" })); }
  process.exitCode = 1;
} finally {
  try { client?.close(); } catch { console.error(JSON.stringify({ event: "cli.database.close_failed", code: "DATABASE_CLOSE_FAILED" })); process.exitCode = 1; }
}
