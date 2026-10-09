// Dependency-free bootstrap: run before installing packages, and never print values.
import { appendFileSync } from "node:fs";

const event = process.env.GITHUB_EVENT_NAME;
const checkOnly = process.env.CHECK_CONFIGURATION === "true";
if (!["schedule", "workflow_dispatch"].includes(event) ||
    ![undefined, "true", "false"].includes(process.env.CHECK_CONFIGURATION)) {
  throw new Error("INVALID_CONFIGURATION_CHECK_INPUT");
}

const required = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
const missing = required.filter((name) => !process.env[name]?.trim());
const configured = missing.length === 0;
const shouldIngest = configured && !checkOnly;
const fail = !configured && event === "workflow_dispatch" && !checkOnly;

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `should_ingest=${shouldIngest}\n`);
}
console.info(JSON.stringify({ event: "workflow.configuration", status: configured ? "configured" : "not_configured",
  operation: checkOnly ? "check_only" : "ingest", ingestion: shouldIngest ? "requested" : "skipped", missing }));

const summary = ["# Bengaluru Pulse ingestion configuration", "",
  `**Configuration:** ${configured ? "Required secrets are present" : "Not configured"}`,
  `**Ingestion:** ${shouldIngest ? "Will run next; this check does not verify database connectivity" : "Skipped; no public sources were polled and no database writes were made"}`, "",
  ...(!configured ? ["Missing repository Actions secrets:", "", ...missing.map((name) => `- \`${name}\``), "",
    "Add them under **Settings → Secrets and variables → Actions**. Scheduled ingestion starts automatically when both exist."] : []),
  ...(checkOnly ? ["", "Configuration-only dispatch: secret presence was checked; credentials and database connectivity were not tested."] : []),
  "", "Mock enrichment remains the free default. OpenAI credentials are optional.", ""].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

if (!configured) {
  const message = `Ingestion is not configured: add repository Actions secrets ${missing.join(" and ")}. No collection was attempted.`;
  if (fail) { console.error(`::error::${message}`); process.exitCode = 1; }
  else console.warn(`::warning::${message}`);
}
