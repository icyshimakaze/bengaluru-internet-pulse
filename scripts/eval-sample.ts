import "./env";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { getDatabase } from "../src/lib/db/client";
import { itemFromRow } from "../src/lib/db/mapping";
import { sampleExport } from "../src/lib/evaluation/sample";
import { manifestSchema, labelColumns } from "../src/lib/evaluation/metrics";
import { parseCsv } from "../src/lib/evaluation/csv";

let client: ReturnType<typeof getDatabase> | undefined;
try {
  const args = z.object({ n: z.coerce.number().int().min(1).max(5000), note: z.string().min(1).max(240).default("Stored non-fixture database rows.") }).parse(parseArgs({ options: { n: { type: "string", default: "150" }, note: { type: "string" } } }).values);
  if (existsSync("eval/labels.csv") && parseCsv(readFileSync("eval/labels.csv", "utf8")).slice(1).some((row) => row.slice(4).some(Boolean))) throw new Error("EVAL_LABELS_ALREADY_FILLED");
  if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = "file:.data/pulse.db";
  if (process.env.TURSO_DATABASE_URL.startsWith("file:") && !existsSync(process.env.TURSO_DATABASE_URL.slice(5))) throw new Error("EVAL_DATABASE_UNAVAILABLE");
  client = getDatabase();
  // Read-only sampling. No migration, collection, enrichment or model client.
  const result = await client.execute({ sql: `SELECT i.*,e.semantic_category FROM items i LEFT JOIN topic_enrichments e ON e.topic_id=i.topic_id
    WHERE i.is_fixture=0 ORDER BY random() LIMIT ?`, args: [args.n] });
  const items = result.rows.map((row) => ({ item: itemFromRow(row), category: row.semantic_category }));
  const output = sampleExport(items);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
  const dates = items.map(({ item }) => item.publishedAt).sort();
  const manifest = manifestSchema.parse({ kind: "live", exportedAt: new Date().toISOString(), commit, dirty, filterRuleVersion: 1, note: args.note,
    observationStart: dates[0] ?? null, observationEnd: dates.at(-1) ?? null, requestedSize: args.n, predictions: output.predictions });
  mkdirSync("eval", { recursive: true });
  writeFileSync("eval/labels.csv", output.csv); writeFileSync("eval/predictions.json", JSON.stringify(manifest, null, 2) + "\n");
  console.info(JSON.stringify({ event: "eval.sample", exported: result.rows.length, requested: args.n, columns: labelColumns, labels: "EMPTY", path: "eval/labels.csv" }));
} catch (error) {
  const code = error instanceof Error && ["EVAL_LABELS_ALREADY_FILLED", "EVAL_DATABASE_UNAVAILABLE"].includes(error.message) ? error.message : "EVAL_SAMPLE_FAILED";
  console.error(JSON.stringify({ event: "eval.sample_failed", code })); process.exitCode = 1;
} finally { client?.close(); }
