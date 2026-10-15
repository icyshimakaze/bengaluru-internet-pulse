import "./env";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { getDatabase } from "../src/lib/db/client";
import { auditStoredData } from "../src/lib/pipeline/data-audit";

const args = z.object({ output: z.string().optional() }).parse({ output: process.argv[2] });
if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = "file:.data/pulse.db";
const client = getDatabase();
try {
  const report = await auditStoredData(client, new Date());
  if (args.output) writeFileSync(args.output, JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report));
} catch {
  console.error(JSON.stringify({ event: "data.audit_failed", code: "AUDIT_READ_FAILED" })); process.exitCode = 1;
} finally { client.close(); }
