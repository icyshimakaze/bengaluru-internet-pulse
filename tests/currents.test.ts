import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCurrentsAdapter, currentsPublishedAt, currentsQueries } from "@/lib/sources/currents";
import { createAdapters } from "@/lib/sources/adapters";
import { fetchJson, type Transport } from "@/lib/sources/http";
import { currentsEnabled, parseIngestionEnv } from "@/lib/server/ingestion-env";
import { ingestionReport, formatIngestionSummary } from "@/lib/server/ingestion-report";
import { ingest } from "@/lib/pipeline/ingest";
import { classifyAI } from "@/lib/pipeline/ai";
import { deduplicate } from "@/lib/pipeline/normalize";
import { evaluateTopics } from "@/lib/trends/engine";
import { topicSnapshot } from "@/lib/trends/snapshots";
import { fromSignal, itemInsert, snapshotInsert, topicInsert } from "@/lib/db/mapping";
import { topicRecordSchema } from "@/lib/db/records";
import { loadMigrations, migrate } from "@/lib/db/schema";
import { checkpointCollection } from "@/lib/db/collection-repository";
import { ReadRepository } from "@/lib/db/read-repository";
import { emptyReadState, projectDashboard, publicSources } from "@/lib/server/projections";
import { SourceAttribution } from "@/components/source-attribution";
import { testRepository } from "./database";
import { now, observation, topic } from "./helpers";

const key = "CURRENTS_PRIVATE_TEST_SENTINEL";
const article = { id: "city-article", title: "Bengaluru metro service improvements expected", description: null,
  url: "https://publisher.example/metro?utm_source=currents", published: "2026-10-06 15:45:00 +0530" };
const payload = { status: "ok", news: [article] };
const mockEnrich: typeof classifyAI = (signals, catalog) => classifyAI(signals, catalog, { provider: "heuristic" });
const publicPayload = (url: string) => new URL(url).hostname === "api.currentsapi.services" ? payload
  : new URL(url).hostname === "api.gdeltproject.org" ? { articles: [] }
    : new URL(url).hostname === "api.bsky.app" ? { posts: [] } : { hits: [] };

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("optional private Currents ingestion", () => {
  it("requires only a raw key, remains off without one, and supports an explicit local disable", () => {
    expect(currentsEnabled(parseIngestionEnv({}))).toBe(false);
    expect(currentsEnabled(parseIngestionEnv({ CURRENTS_API_KEY: " " }))).toBe(false);
    expect(currentsEnabled(parseIngestionEnv({ CURRENTS_API_KEY: ` ${key} ` }))).toBe(true);
    expect(currentsEnabled(parseIngestionEnv({ CURRENTS_API_KEY: key, CURRENTS_ENABLED: "false" }))).toBe(false);
    expect(() => parseIngestionEnv({ CURRENTS_ENABLED: "yes" })).toThrow("CURRENTS_ENABLED");
    expect(() => parseIngestionEnv({ CURRENTS_API_KEY: "Bearer secret" })).toThrow("CURRENTS_API_KEY");
  });

  it("uses one free-tier-sized search with an explicit UTC day window and no credential in the URL", () => {
    const queries = currentsQueries(now), url = new URL(queries[0]!.url);
    expect(queries).toHaveLength(1); expect(queries[0]?.limit).toBe(20);
    expect(url.origin + url.pathname).toBe("https://api.currentsapi.services/v2/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ query: "Bengaluru OR Bangalore", language: "en", page_size: "20",
      start_date: "2026-10-05T10:30:00.000Z", end_date: now.toISOString() });
    expect(url.searchParams.has("apiKey")).toBe(false);
  });

  it("attaches authorization only to Currents requests and keeps raw keys/payloads out of logs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => Response.json(publicPayload(String(url))));
    const transport: Transport = (url, options) => fetchJson(url, { ...options, fetcher });
    const adapters = createAdapters(transport, { currentsKey: key });
    await Promise.all(Object.values(adapters).map((adapter) => adapter(now, 1000)));
    const calls = fetcher.mock.calls;
    expect(calls.filter(([url]) => new URL(String(url)).hostname === "api.currentsapi.services")).toHaveLength(1);
    for (const [url, init] of calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(new URL(String(url)).hostname === "api.currentsapi.services" ? `Bearer ${key}` : null);
      expect(String(url)).not.toContain(key);
      expect(init).toMatchObject({ redirect: "error", cache: "no-store", credentials: "omit" });
    }
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/CURRENTS_PRIVATE_TEST_SENTINEL|publisher\.example|metro service improvements/);
  });

  it.each([
    ["2026-10-06 15:45:00 +0530", "2026-10-06T10:15:00.000Z"],
    ["2026-10-06T12:30:00+02:00", "2026-10-06T10:30:00.000Z"],
    ["2026-10-06T10:15:00Z", "2026-10-06T10:15:00.000Z"],
    ["2026-02-30 10:00:00 +0000", null], ["2026-10-06 10:15:00", null], ["yesterday", null],
  ])("preserves valid publication offsets and rejects ambiguous/invalid dates: %s", (input, expected) => {
    expect(currentsPublishedAt(input)).toBe(expected);
  });

  it("accepts headline-only articles, rejects bad siblings and deduplicates source identities/URLs", async () => {
    const result = await createCurrentsAdapter(key, async () => ({ status: "ok", news: [article, { ...article, id: "copy" },
      { ...article, id: "future", published: "2026-10-06T10:31:00Z" }, { ...article, id: "old", published: "2026-10-05T10:29:00Z" },
      { ...article, id: "unsafe", url: "http://localhost/private" }, { ...article, id: "bad-date", published: "unknown" }] }))(now, 1000);
    expect(result.health).toMatchObject({ status: "ok", fetched: 6, accepted: 2, rejected: 4, duplicates: 1 });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({ source: "currents", sourceId: "city-article", sourceType: "news", timeKind: "published",
      publishedAt: "2026-10-06T10:15:00.000Z", canonicalUrl: "https://publisher.example/metro", text: article.title });
    expect(deduplicate(result.signals, [{ ...result.signals[0]!, source: "gdelt", id: "gdelt-copy" }])).toEqual([]);
  });

  it("treats empty searches as healthy, rejects malformed envelopes and enforces its deadline", async () => {
    expect((await createCurrentsAdapter(key, async () => ({ status: "ok", news: [] }))(now, 1000)).health).toMatchObject({ status: "ok", accepted: 0 });
    expect((await createCurrentsAdapter(key, async () => ({ status: "error", news: [] }))(now, 1000)).health).toMatchObject({ status: "error", error: "INVALID_PAYLOAD" });
    expect((await createCurrentsAdapter(key, async () => ({ status: "ok", news: Array(21).fill(article) }))(now, 1000)).health).toMatchObject({ status: "error", error: "RESULT_LIMIT_EXCEEDED" });
    expect((await createCurrentsAdapter(key, () => new Promise(() => {}), { budgetMs: 25 })(now, 1000)).health).toMatchObject({ status: "error", error: "TIMEOUT" });
  });

  it("auto-enables ingestion from the key, publishes news/health safely and never counts a repeated poll", async () => {
    vi.stubEnv("CURRENTS_API_KEY", key); vi.stubEnv("CURRENTS_ENABLED", "auto");
    const repo = testRepository(), adapters = createAdapters(async (url) => publicPayload(url), { currentsKey: key });
    const first = await ingest({ repository: repo, now, adapters, enrich: mockEnrich });
    expect(first.added).toBe(1); expect(first.runs).toHaveLength(4);
    const report = ingestionReport(first, false, now);
    expect(report.availableSources).toBe(4); expect(report.sources).toHaveLength(4);
    expect(formatIngestionSummary(report)).toContain("| currents | completed | 1 | 1 | 0 | 0 |");
    expect(first.pulse?.sources.find((s) => s.source === "currents")).toMatchObject({ status: "ok", accepted: 1 });
    const second = await ingest({ repository: repo, now, adapters, enrich: mockEnrich });
    expect(second.added).toBe(0); expect(second.runs.find((r) => r.source === "currents")).toMatchObject({ inserted: 0, duplicates: 1 });
    const dashboard = projectDashboard(await new ReadRepository(repo.client).load(now), { window: "24h", source: "currents" }, now);
    expect(dashboard.sources).toHaveLength(4);
    expect(dashboard.sourceStream[0]).toMatchObject({ source: "currents", sourceType: "news" });
    expect(dashboard.sources.find((s) => s.source === "currents")).toMatchObject({ healthState: "live", lastSuccessAt: now.toISOString(), lastItemAt: "2026-10-06T10:15:00.000Z" });
    expect(JSON.stringify(dashboard)).not.toContain(key);
    expect(projectDashboard(emptyReadState(now), { window: "24h" }, now).sources).toHaveLength(3);
    expect(renderToStaticMarkup(createElement(SourceAttribution, { source: "currents" }))).toContain("Powered by Currents News API");
    expect(renderToStaticMarkup(createElement(SourceAttribution, { source: "gdelt" }))).toBe("");
  });

  it.each(["HTTP_401", "HTTP_429", "HTTP_503"])("isolates %s while the other three providers publish", async (code) => {
    vi.stubEnv("CURRENTS_API_KEY", key); vi.stubEnv("CURRENTS_ENABLED", "auto");
    const repo = testRepository();
    const adapters = createAdapters(async (url) => {
      if (new URL(url).hostname === "api.currentsapi.services") throw new Error(code);
      return publicPayload(url);
    }, { currentsKey: key });
    const result = await ingest({ repository: repo, now, adapters, enrich: mockEnrich });
    expect(result.pulse?.status).toBe("degraded"); expect(result.runs).toHaveLength(4);
    expect(ingestionReport(result, false, now)).toMatchObject({ status: "degraded", availableSources: 3 });
    expect(result.runs.filter((r) => r.source !== "currents").every((r) => r.status === "completed")).toBe(true);
    expect(result.pulse?.sources.find((s) => s.source === "currents")).toMatchObject({ status: "error", error: code });
  });

  it("keeps disabled Currents out of source availability and fixtures even when a key exists", async () => {
    vi.stubEnv("CURRENTS_API_KEY", key); vi.stubEnv("CURRENTS_ENABLED", "false");
    const transport = vi.fn<Transport>().mockImplementation(async (url) => publicPayload(url));
    const repo = testRepository(), adapters = createAdapters(transport, { currentsKey: key });
    const result = await ingest({ repository: repo, now, adapters, enrich: mockEnrich });
    expect(result.runs).toHaveLength(3); expect(result.pulse?.status).toBe("healthy");
    vi.stubEnv("CURRENTS_ENABLED", "auto");
    const demo = await ingest({ repository: repo, now, mode: "demo", adapters, enrich: mockEnrich });
    expect(demo.runs).toHaveLength(3);
    expect(transport.mock.calls.every(([url]) => new URL(url).hostname !== "api.currentsapi.services")).toBe(true);
    const oldCurrents = { source: "currents" as const, status: "ok" as const, fetched: 0, accepted: 0, rejected: 0, durationMs: 0, checkedAt: now.toISOString() };
    expect(publicSources([oldCurrents], [], now, "demo")).toHaveLength(3);
  });
});

describe("Currents database upgrade and scoring", () => {
  it("preserves all v7 rows, pending attempts, xKiro provenance, guards and immutable history", async () => {
    const repo = testRepository(); await migrate(repo.client, loadMigrations().slice(0, 7), now);
    const evidence = [observation("migration-news", 0.25, "gdelt"), observation("migration-social", 0.5)];
    const record = topicRecordSchema.parse({ id: "preserved-topic", slug: topic.slug, canonicalLabel: topic.title, category: topic.category,
      neighborhood: null, firstSeenAt: evidence[1]!.publishedAt, lastSeenAt: evidence[0]!.publishedAt, lifecycle: "EMERGING", pulseScore: 40,
      confidence: 0.3, summary: topic.description, enrichmentMethod: "ai", isFixture: false });
    const run = await repo.startIngestionRun("gdelt", now, false);
    const item = fromSignal(evidence[0]!, { topicId: record.id, category: record.category, localRelevance: 1, enrichmentStatus: "completed",
      enrichmentProvider: "xkiro", ingestionRunId: run.id });
    const oldSnapshot = { ...topicSnapshot(record.id, evidence, now), algorithmVersion: "v2" as const };
    await repo.client.batch([topicInsert(record), itemInsert(item), snapshotInsert(oldSnapshot),
      { sql: "UPDATE items SET enrichment_attempts=2,enrichment_attempted_at=? WHERE id=?", args: [now.toISOString(), item.id] },
      { sql: "INSERT INTO item_enrichments VALUES (?,?,?,?,?,?)", args: [item.id, "xkiro", "google/test-model", JSON.stringify({ preserved: true }), 0.9, now.toISOString()] }], "write");
    await repo.completeIngestionRun(run.id, { status: "completed", finishedAt: now.toISOString(), discovered: 1, inserted: 1, duplicates: 0, errors: 0, errorMessage: null });
    await checkpointCollection(repo.client, { source: "gdelt", status: "ok", fetched: 1, accepted: 1, rejected: 0, durationMs: 1, checkedAt: now.toISOString() }, [evidence[0]!], false, now);
    const tables = ["items", "item_enrichments", "ingestion_runs", "topic_snapshots", "source_collections", "schema_migrations"];
    const before = await Promise.all(tables.map(async (table) => (await repo.client.execute(`SELECT * FROM ${table}`)).rows.map((r) => ({ ...r }))));
    const broken = loadMigrations().map((migration) => migration.version === 8
      ? { ...migration, sql: migration.sql + "\nINSERT INTO deliberately_missing_table VALUES (1);" } : migration);
    await expect(migrate(repo.client, broken, now)).rejects.toThrow();
    for (const [index, table] of tables.entries()) {
      expect((await repo.client.execute(`SELECT * FROM ${table}`)).rows.map((r) => ({ ...r }))).toEqual(before[index]);
    }
    expect(await repo.initialize()).toEqual({ applied: [8], version: 8 });
    for (const [index, table] of tables.entries()) {
      const after = (await repo.client.execute(`SELECT * FROM ${table}${table === "schema_migrations" ? " WHERE version<=7" : ""}`)).rows.map((r) => ({ ...r }));
      expect(after).toEqual(before[index]);
    }
    const currentsRun = await repo.startIngestionRun("currents", now, false);
    await repo.insertItem(fromSignal(observation("new-currents", 0.1, "currents"), { ingestionRunId: currentsRun.id }));
    const four = [...evidence, observation("migration-currents", 0.1, "currents"), observation("migration-hn", 0.2, "hackernews")];
    await repo.saveSnapshots([topicSnapshot(record.id, four, now)]);
    expect((await repo.fetchTopicHistory(record.id)).map((row) => row.algorithmVersion)).toEqual(["v2", "v3"]);
    expect((await repo.fetchTopicHistory(record.id)).at(-1)).toMatchObject({ sourceCount: 4, scoringSourceCount: 3 });
    await expect(repo.insertItem(fromSignal(observation("wrong-run", 0.1, "currents"), { ingestionRunId: run.id }))).rejects.toThrow();
    await expect(repo.client.execute({ sql: "INSERT INTO ingestion_runs(id,source,started_at) VALUES (?,?,?)", args: ["bad-source", "unknown", now.toISOString()] })).rejects.toThrow();
    expect((await repo.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect(await repo.initialize()).toEqual({ applied: [], version: 8 });
  });

  it("counts four providers but three channels, and never treats two news indexes as cross-channel support", () => {
    const news = Array.from({ length: 8 }, (_, i) => observation(`channel-${i}`, 0.2, i % 2 ? "currents" : "gdelt"));
    const singleIndex = news.map((o) => ({ ...o, source: "gdelt" as const }));
    const a = evaluateTopics([topic], news, now)[0]!, b = evaluateTopics([topic], singleIndex, now)[0]!;
    expect(a.sourceCount).toBe(2); expect(a.diversity).toBeCloseTo(1 / 3);
    expect(a.score).toBe(b.score); expect(a.confidence).toBe(b.confidence); expect(a.scoreCap).toBe(55);
    const four = [...news, observation("channel-social", 0.3, "bluesky"), observation("channel-tech", 0.4, "hackernews")];
    const snapshot = topicSnapshot("topic", four, now);
    expect(snapshot).toMatchObject({ sourceCount: 4, scoringSourceCount: 3, diversityScore: 1, algorithmVersion: "v3" });
  });
});
