import "./env";
import { ingest } from "../src/lib/pipeline/ingest";
import { getDatabase } from "../src/lib/db/client";

try {
  const result = await ingest();
  console.info(JSON.stringify({ event: "cli.ingest", added: result.added, skipped: result.skipped, status: result.pulse?.status }));
  if (result.pulse?.status === "unavailable") process.exitCode = 1;
} catch { console.error(JSON.stringify({ event: "cli.ingest.failed", hint: "Check database configuration and connectivity." })); process.exitCode = 1; }
finally { try { getDatabase().close(); } catch { /* No client was initialized. */ } }
