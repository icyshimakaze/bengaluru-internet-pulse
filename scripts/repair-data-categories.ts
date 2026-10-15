import "./env";
import { getDatabase } from "../src/lib/db/client";
import { Repository } from "../src/lib/db/repository";
import { previewCategoryRepairs, applyCategoryRepairs } from "../src/lib/pipeline/repair-categories";

if (process.argv.slice(2).some((arg) => arg !== "--apply")) throw new Error("Usage: repair-data-categories.ts [--apply]");
if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = "file:.data/pulse.db";
const client = getDatabase(), repository = new Repository(client);
let owner: string | null = null;
try {
  console.info(JSON.stringify({ event: "data.category_repair_preview", repairs: await previewCategoryRepairs(client) }));
  if (process.argv.includes("--apply")) {
    const now = new Date(); owner = await repository.acquireLease(now);
    if (!owner) throw new Error("LEASE_BUSY");
    console.info(JSON.stringify({ event: "data.category_repair_applied", repairs: await applyCategoryRepairs(client, owner, now) }));
  }
} catch {
  console.error(JSON.stringify({ event: "data.category_repair_failed", code: "CATEGORY_REPAIR_FAILED" })); process.exitCode = 1;
} finally { if (owner) await repository.releaseLease(owner); client.close(); }
