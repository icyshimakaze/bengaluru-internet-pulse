import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { Repository } from "../src/lib/db/repository";
import { seedFixtures } from "../src/lib/db/seed";

// Deliberately ignores TURSO_DATABASE_URL: fixtures must never seed production.
mkdirSync(".data", { recursive: true });
const client = createClient({ url: "file:.data/seed.db" });
try {
  const result = await seedFixtures(new Repository(client));
  console.info(JSON.stringify({ event: "database.seeded", database: ".data/seed.db", mode: "demo",
    inserted: result.inserted, topics: result.pulse.trends.length, items: result.pulse.totalSignals }));
} catch {
  console.error("Local fixture seed failed."); process.exitCode = 1;
} finally { client.close(); }
