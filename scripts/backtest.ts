import "./env";
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { getDatabase } from "../src/lib/db/client";
import { slugSchema } from "../src/lib/domain/schema";
import { snapshotFromRow } from "../src/lib/db/mapping";
import { backtestTimeline } from "../src/lib/evaluation/backtest";
let client: ReturnType<typeof getDatabase> | undefined;
try {
  const { topic } = z.object({ topic: slugSchema }).parse(parseArgs({ options: { topic: { type: "string" } } }).values);
  if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = "file:.data/pulse.db";
  if (process.env.TURSO_DATABASE_URL.startsWith("file:") && !existsSync(process.env.TURSO_DATABASE_URL.slice(5))) throw new Error("BACKTEST_DATABASE_UNAVAILABLE");
  client = getDatabase();
  const rows = await client.execute({ sql: `SELECT s.* FROM topic_snapshots s JOIN topics t ON t.id=s.topic_id
    WHERE t.slug=? AND t.is_fixture=0 ORDER BY s.captured_at,s.algorithm_version`, args: [topic] });
  const output = backtestTimeline(topic, rows.rows.map(snapshotFromRow));
  mkdirSync(".cache/backtests", { recursive: true });
  writeFileSync(`.cache/backtests/${topic}.csv`, output.csv); writeFileSync(`.cache/backtests/${topic}.md`, output.markdown);
  console.info(output.markdown); console.info(`CSV: .cache/backtests/${topic}.csv`);
} catch (error) {
  console.error(JSON.stringify({ event: "backtest.failed", code: error instanceof Error && error.message === "BACKTEST_DATABASE_UNAVAILABLE" ? error.message : "BACKTEST_READ_FAILED" })); process.exitCode = 1;
} finally { client?.close(); }
