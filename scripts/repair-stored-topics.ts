import "./env";
import { getDatabase } from "../src/lib/db/client";
import { Repository } from "../src/lib/db/repository";
import { repairStoredTopics } from "../src/lib/pipeline/repair-topics";
if (process.argv.slice(2).some((arg) => arg !== "--apply")) throw new Error("Usage: repair-stored-topics.ts [--apply]");
if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = "file:.data/pulse.db";
const client = getDatabase(), repo = new Repository(client);
let owner: string | null = null;
try {
  const now = new Date();
  console.info(JSON.stringify({ event: "data.topic_repair_preview", repairs: await repairStoredTopics(client, { now }) }));
  if (process.argv.includes("--apply")) {
    owner = await repo.acquireLease(now); if (!owner) throw new Error("LEASE_BUSY");
    console.info(JSON.stringify({ event: "data.topic_repair_applied", repairs: await repairStoredTopics(client, { apply: true, owner, now }) }));
  }
} catch { console.error(JSON.stringify({ event: "data.topic_repair_failed", code: "TOPIC_REPAIR_FAILED" })); process.exitCode = 1; }
finally { if (owner) await repo.releaseLease(owner); client.close(); }
