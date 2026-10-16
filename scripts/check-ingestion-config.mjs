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
const limits = [{ name: "AI_BATCH_SIZE", max: 10 }, { name: "MAX_AI_ITEMS_PER_RUN", max: 30 }];
const invalid = limits.filter(({ name, max }) => {
  const raw = process.env[name] ?? String(max), value = Number(raw);
  return !raw.trim() || !Number.isInteger(value) || value < 1 || value > max;
}).map(({ name }) => name);
const shouldIngest = configured && !invalid.length && !checkOnly;
const fail = invalid.length > 0 || !configured && event === "workflow_dispatch" && !checkOnly;

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `should_ingest=${shouldIngest}\n`);
}
console.info(JSON.stringify({ event: "workflow.configuration", status: !configured ? "not_configured" : invalid.length ? "invalid_configuration" : "configured",
  operation: checkOnly ? "check_only" : "ingest", ingestion: shouldIngest ? "requested" : "skipped", missing, invalid }));

const summary = ["# Bengaluru Pulse ingestion configuration", "",
  `**Configuration:** ${configured ? "Required secrets are present" : "Not configured"}`,
  `**Worker limits:** ${invalid.length ? "Invalid: " + invalid.join(", ") : "Valid"}`,
  `**Ingestion:** ${shouldIngest ? "Will run next; this check does not verify database connectivity" : "Skipped; no public sources were polled and no database writes were made"}`, "",
  ...(!configured ? ["Missing repository Actions secrets:", "", ...missing.map((name) => `- \`${name}\``), "",
    "Add them under **Settings → Secrets and variables → Actions**. Scheduled ingestion starts automatically when both exist."] : []),
  ...(checkOnly ? ["", "Configuration-only dispatch: secret presence was checked; credentials and database connectivity were not tested."] : []),
  ...(invalid.length ? ["", "Correct the repository Actions Variables: `AI_BATCH_SIZE` must be 1–10; `MAX_AI_ITEMS_PER_RUN` must be 1–30. Values are not printed."] : []),
  "", "OpenAI and xKiro credentials are provider-specific and optional for this database setup check. API enrichment failures use local heuristic fallback.", ""].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

if (!configured) {
  const message = `Ingestion is not configured: add repository Actions secrets ${missing.join(" and ")}. No collection was attempted.`;
  if (fail) { console.error(`::error::${message}`); process.exitCode = 1; }
  else console.warn(`::warning::${message}`);
}
if (invalid.length) console.error(`::error::Invalid Actions Variables: ${invalid.join(", ")}. AI_BATCH_SIZE must be 1–10; MAX_AI_ITEMS_PER_RUN must be 1–30. No collection was attempted.`);
if (fail) process.exitCode = 1;
