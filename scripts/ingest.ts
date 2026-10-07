import "./env";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { ingest } from "../src/lib/pipeline/ingest";
import { getDatabase } from "../src/lib/db/client";
import { Repository } from "../src/lib/db/repository";
import { createAdapters } from "../src/lib/sources/adapters";
import { FIXTURE_NOW } from "../src/fixtures/demo";
import fixtures from "../src/fixtures/public-sources.json";

let client: Client | undefined;
try {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--fixtures", "--help"].includes(arg))) throw new Error("INVALID_CLI_ARGUMENT");
  if (args.includes("--help")) {
    console.info("Usage: npm run ingest [-- --fixtures]\nLive: configured Turso database or local .data/pulse.db.\nFixtures: offline fictional signals in isolated .data/ingestion-fixtures.db.");
  } else {
    const fixtureMode = args.includes("--fixtures");
    if (fixtureMode) {
      mkdirSync(".data", { recursive: true });
      client = createClient({ url: "file:.data/ingestion-fixtures.db" });
    } else {
      if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = "file:.data/pulse.db";
      client = getDatabase();
    }
    const adapters = fixtureMode ? createAdapters(async (url) => {
      const host = new URL(url).hostname;
      return host === "api.gdeltproject.org" ? fixtures.gdelt : host === "public.api.bsky.app" ? fixtures.bluesky : fixtures.hackernews;
    }) : undefined;
    const result = await ingest({ repository: new Repository(client), ...(fixtureMode ? {
      mode: "demo", enrichmentMode: "mock", now: FIXTURE_NOW, timeoutMs: 1000, adapters,
    } : {}) });
    console.info(JSON.stringify({ event: "cli.ingest", mode: result.pulse?.mode ?? (fixtureMode ? "demo" : "live"),
      added: result.added, skipped: result.skipped, status: result.pulse?.status ?? "busy", enrichment: result.pulse?.enrichment, sources: result.pulse?.sources }));
    if (result.pulse?.status === "unavailable") process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ event: "cli.ingest.failed", code: error instanceof Error && error.message === "INVALID_CLI_ARGUMENT" ? error.message : "INGEST_FAILED",
    hint: "Use --help for options; check database configuration and connectivity." }));
  process.exitCode = 1;
} finally { client?.close(); }
