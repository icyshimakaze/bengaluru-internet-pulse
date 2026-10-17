import { describe, expect, it, vi } from "vitest";
import type { TransactionMode } from "@libsql/client";
import { testRepository } from "./database";
import { loadMigrations, migrate } from "@/lib/db/schema";
import { demoDataset, demoPulse } from "@/fixtures/demo";
import { now } from "./helpers";
import { legacyLifecycle } from "@/lib/db/records";
import { observation } from "./helpers";
import { fromSignal } from "@/lib/db/mapping";

const legacySql = `
  CREATE TABLE topics(slug TEXT PRIMARY KEY,payload TEXT NOT NULL);
  CREATE TABLE observations(id TEXT PRIMARY KEY,source TEXT NOT NULL,source_id TEXT NOT NULL,canonical_url TEXT UNIQUE NOT NULL,
    content_hash TEXT UNIQUE NOT NULL,topic_slug TEXT NOT NULL REFERENCES topics(slug),published_at TEXT NOT NULL,payload TEXT NOT NULL);
  CREATE TABLE snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,generated_at TEXT NOT NULL,payload TEXT NOT NULL);
  CREATE TABLE leases(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at INTEGER NOT NULL);
  CREATE TABLE publish_guard(id INTEGER PRIMARY KEY CHECK(id=1),valid INTEGER NOT NULL CHECK(valid=1));
  PRAGMA user_version=1;
`;
describe("versioned SQL migrations", () => {
  it("initializes remote backends that reject user_version writes while retaining the authoritative ledger", async () => {
    const repo = testRepository();
    const remote = new Proxy(repo.client, { get(target, property) {
      if (property === "protocol") return "http";
      if (property === "transaction") return async (mode?: TransactionMode) => {
        const transaction = await target.transaction(mode), execute = transaction.execute.bind(transaction);
        vi.spyOn(transaction, "execute").mockImplementation(async (statement) => {
          const sql = typeof statement === "string" ? statement : statement.sql;
          if (/PRAGMA\s+user_version\s*=/i.test(sql)) throw new Error("SQL_PARSE_ERROR: SQL not allowed statement: PRAGMA user_version");
          return execute(statement);
        });
        return transaction;
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    expect(await migrate(remote, undefined, now)).toEqual({ applied: [1, 2, 3, 4, 5, 6, 7, 8], version: 8 });
    expect(await migrate(remote, undefined, now)).toEqual({ applied: [], version: 8 });
    expect((await repo.client.execute("SELECT count(*) AS count FROM schema_migrations")).rows[0]?.count).toBe(8);
    expect((await repo.client.execute("PRAGMA user_version")).rows[0]?.user_version).toBe(0);
    expect((await repo.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
  it("creates relational tables, required fields, indexes, foreign keys and an immutable ledger", async () => {
    const repo = testRepository();
    expect(await migrate(repo.client, undefined, now)).toEqual({ applied: [1, 2, 3, 4, 5, 6, 7, 8], version: 8 });
    expect(await repo.initialize()).toEqual({ applied: [], version: 8 });
    const expected = {
      items: ["id", "source", "source_id", "canonical_url", "title", "excerpt", "domain", "published_at", "collected_at", "content_fingerprint", "topic_id", "category", "neighborhood", "local_relevance", "enrichment_status", "enrichment_provider"],
      topics: ["id", "slug", "canonical_label", "category", "neighborhood", "first_seen_at", "last_seen_at", "lifecycle", "pulse_score", "confidence", "summary"],
      topic_snapshots: ["topic_id", "captured_at", "count_2h", "previous_count_2h", "count_6h", "count_24h", "source_count", "velocity_score", "volume_score", "diversity_score", "recency_score", "confidence", "pulse_score", "lifecycle"],
      ingestion_runs: ["id", "source", "started_at", "finished_at", "discovered", "inserted", "duplicates", "errors", "status", "error_message"],
    };
    for (const [table, names] of Object.entries(expected)) {
      const columns = (await repo.client.execute("PRAGMA table_info(" + table + ")")).rows.map((r) => r.name);
      expect(columns).toEqual(expect.arrayContaining(names));
    }
    expect((await repo.client.execute("SELECT * FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")).rows.length).toBeGreaterThanOrEqual(17);
    expect((await repo.client.execute("PRAGMA foreign_key_list(items)")).rows).toHaveLength(2);
    expect((await repo.client.execute("PRAGMA user_version")).rows[0]?.user_version).toBe(8);
    const edited = loadMigrations().map((m, i) => i ? m : { ...m, sql: m.sql + "\n-- edited" });
    await expect(migrate(repo.client, edited)).rejects.toThrow("has changed");
  });
  it("rolls back failed DDL without recording it and can retry a corrected migration", async () => {
    const repo = testRepository(); await repo.initialize();
    const migration = { version: 9, name: "0009_failure.sql", sql: "CREATE TABLE rollback_probe(id TEXT); INSERT INTO missing_table VALUES (1);" };
    await expect(migrate(repo.client, [...loadMigrations(), migration])).rejects.toThrow();
    expect((await repo.client.execute("SELECT name FROM sqlite_master WHERE name='rollback_probe'")).rows).toHaveLength(0);
    expect((await repo.client.execute("SELECT * FROM schema_migrations")).rows).toHaveLength(8);
    expect(await migrate(repo.client, [...loadMigrations(), { ...migration, sql: "CREATE TABLE rollback_probe(id TEXT);" }])).toEqual({ applied: [9], version: 9 });
    await expect(repo.initialize()).rejects.toThrow("Unsupported migration history");
  });
  it("rejects out-of-order versions and missing ledger entries", async () => {
    const repo = testRepository();
    await expect(migrate(repo.client, [{ version: 2, name: "gap.sql", sql: "SELECT 1;" }])).rejects.toThrow("contiguous");
    await repo.initialize();
    await repo.client.execute("DELETE FROM schema_migrations WHERE version=2");
    await expect(repo.initialize()).rejects.toThrow("Unsupported migration history");
  });
  it("preserves legacy provenance, topics and latest repeated-capture snapshots", async () => {
    const repo = testRepository(), dataset = demoDataset(now), current = demoPulse(now);
    const demo = { ...current, version: "v1", trends: current.trends.map((t) => ({ ...t, lifecycle: legacyLifecycle(t.lifecycle) })) };
    const live = { ...demo, mode: "live", status: "healthy" };
    await repo.client.executeMultiple(legacySql);
    await repo.client.batch([
      ...dataset.topics.map((t) => ({ sql: "INSERT INTO topics VALUES (?,?)", args: [t.slug, JSON.stringify(t)] })),
      ...dataset.observations.map((o) => ({ sql: "INSERT INTO observations VALUES (?,?,?,?,?,?,?,?)",
        args: [o.id, o.source, o.sourceId, o.canonicalUrl, o.contentHash, o.topicSlug, o.publishedAt, JSON.stringify(o)] })),
      { sql: "INSERT INTO snapshots(generated_at,payload) VALUES (?,?)", args: [live.generatedAt!, JSON.stringify(live)] },
      { sql: "INSERT INTO snapshots(generated_at,payload) VALUES (?,?)", args: [live.generatedAt!, JSON.stringify({ ...live, notice: "Latest repeated capture" })] },
      { sql: "INSERT INTO snapshots(generated_at,payload) VALUES (?,?)", args: [demo.generatedAt!, JSON.stringify(demo)] },
    ], "write");
    await repo.initialize();
    const restored = await repo.load(now);
    expect(restored.observations).toHaveLength(dataset.observations.length);
    expect(restored.observations).toEqual(expect.arrayContaining(dataset.observations));
    for (const t of dataset.topics) expect(restored.topics).toContainEqual(expect.objectContaining(t));
    expect((await repo.latest())?.notice).toContain("Latest repeated capture");
    expect((await repo.latest())?.version).toBe("v2");
    expect((await repo.latest("demo"))?.mode).toBe("demo");
    expect((await repo.load(now, true)).items).toHaveLength(221);
    expect(await repo.fetchTopicHistory(restored.topicRecords[0]!.id)).toHaveLength(1);
    const tables = (await repo.client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name);
    expect(tables).not.toContain("observations");
    expect(tables).not.toContain("legacy_topics");
    expect((await repo.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect(await repo.initialize()).toEqual({ applied: [], version: 8 });
  });
  it("leaves the original legacy schema and rows intact if backfill validation fails", async () => {
    const repo = testRepository();
    await repo.client.executeMultiple(legacySql);
    await repo.client.execute({ sql: "INSERT INTO topics VALUES (?,?)", args: ["invalid", "{broken-json"] });
    await expect(repo.initialize()).rejects.toThrow();
    expect((await repo.client.execute("SELECT payload FROM topics")).rows[0]?.payload).toBe("{broken-json");
    expect((await repo.client.execute("SELECT name FROM sqlite_master WHERE name='items'")).rows).toHaveLength(0);
    expect((await repo.client.execute("SELECT * FROM schema_migrations")).rows).toHaveLength(0);
    expect((await repo.client.execute("PRAGMA user_version")).rows[0]?.user_version).toBe(1);
  });
  it("upgrades provider constraints while preserving historic mock/OpenAI provenance and all prior checksums", async () => {
    const repo = testRepository(); await migrate(repo.client, loadMigrations().slice(0, 5), now);
    const history = (await repo.client.execute("SELECT name,checksum FROM schema_migrations ORDER BY version")).rows;
    for (const provider of ["mock", "openai"] as const) {
      const signal = observation("historic-" + provider, 1);
      await repo.insertItem(fromSignal(signal));
      const result = { signal_id: signal.id, existing_topic_id: null,
        new_topic: { canonical_label: "Bengaluru metro", slug: "bengaluru-metro", category: "traffic" },
        canonical_label: "Bengaluru metro", slug: "bengaluru-metro", category: "traffic", neighborhood: "Citywide",
        local_relevance: 1, summary: "Public mentions of Bengaluru metro.", confidence: 0.9 };
      await repo.client.execute({ sql: "INSERT INTO item_enrichments VALUES (?,?,?,?,?,?)", args: [signal.id, provider,
        provider === "openai" ? "gpt-6-luna" : null, JSON.stringify(result), 0.9, now.toISOString()] });
    }
    expect(await repo.initialize()).toEqual({ applied: [6, 7, 8], version: 8 });
    expect((await repo.client.execute("SELECT name,checksum FROM schema_migrations WHERE version<=5 ORDER BY version")).rows).toEqual(history);
    for (const provider of ["mock", "openai"] as const) {
      const id = observation("historic-" + provider, 1).id;
      expect(await repo.enrichment.find(id)).toMatchObject({ provider, model: provider === "openai" ? "gpt-6-luna" : null });
      expect((await repo.client.execute({ sql: "SELECT enrichment_provider FROM items WHERE id=?", args: [id] })).rows[0]?.enrichment_provider).toBe(provider);
    }
    expect((await repo.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect(await repo.enrichment.recentRuns()).toEqual([]);
  });
});
