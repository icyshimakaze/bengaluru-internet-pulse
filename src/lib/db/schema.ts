import "server-only";
import type { Client } from "@libsql/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { backfillLegacy } from "./legacy-v1";

export type Migration = { version: number; name: string; sql: string };
export function loadMigrations(): Migration[] {
  return ["0001_core.sql", "0002_indexes.sql", "0003_dataset_guards.sql", "0004_semantic_enrichment.sql", "0005_trend_scoring_v2.sql", "0006_enrichment_providers.sql"].map((name, i) => ({ version: i + 1, name, sql: readFileSync(join(process.cwd(), "src/lib/db/migrations", name), "utf8") }));
}
export async function migrate(client: Client, migrations = loadMigrations(), now = new Date()): Promise<{ applied: number[]; version: number }> {
  if (migrations.some((m, i) => m.version !== i + 1)) throw new Error("Migration versions must be contiguous and ordered");
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const history = await client.execute("SELECT version FROM schema_migrations ORDER BY version");
  if (history.rows.some((r, i) => Number(r.version) !== i + 1 || Number(r.version) > migrations.length)) throw new Error("Unsupported migration history");
  const applied: number[] = [];
  for (const migration of migrations) {
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    // The local SDK replaces the connection after an interactive transaction.
    await client.execute("PRAGMA foreign_keys = ON");
    const tx = await client.transaction("write");
    try {
      const entry = (await tx.execute({ sql: "SELECT name,checksum FROM schema_migrations WHERE version=?", args: [migration.version] })).rows[0];
      if (entry) {
        if (entry.name !== migration.name || entry.checksum !== checksum) throw new Error(`Applied migration ${migration.version} has changed`);
        await tx.rollback(); continue;
      }
      let legacy = false;
      if (migration.version === 1) {
        const columns = await tx.execute("PRAGMA table_info(topics)");
        legacy = columns.rows.some((r) => r.name === "payload") && !columns.rows.some((r) => r.name === "id");
        if (legacy) await tx.executeMultiple("ALTER TABLE topics RENAME TO legacy_topics; ALTER TABLE observations RENAME TO legacy_observations; ALTER TABLE snapshots RENAME TO legacy_snapshots;");
      }
      await tx.executeMultiple(migration.sql);
      if (legacy) {
        await backfillLegacy(tx, now);
        await tx.executeMultiple("DROP TABLE legacy_observations; DROP TABLE legacy_topics; DROP TABLE legacy_snapshots; DROP TABLE IF EXISTS publish_guard;");
      }
      if ((await tx.execute("PRAGMA foreign_key_check")).rows.length) throw new Error("Migration violated foreign key integrity");
      await tx.execute({ sql: "INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES (?,?,?,?)", args: [migration.version, migration.name, checksum, now.toISOString()] });
      // Turso's remote SQL API rejects header pragmas such as user_version.
      // The checksummed ledger is authoritative on every backend; keep this
      // SQLite file-header marker only for local databases.
      if (client.protocol === "file") await tx.execute(`PRAGMA user_version = ${migration.version}`);
      await tx.commit(); applied.push(migration.version);
    } finally { tx.close(); }
  }
  return { applied, version: migrations.length };
}
