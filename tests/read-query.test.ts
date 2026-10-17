import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testRepository } from "./database";
import { now, observation, pulse, topic } from "./helpers";
import { ReadRepository } from "@/lib/db/read-repository";
import { readQuerySchema, dashboardSchema, topicDetailSchema } from "@/lib/domain/read-models";
import { demoReadState, projectDashboard, projectTopic, projectHealth } from "@/lib/server/projections";
import { fromSignal } from "@/lib/db/mapping";
import { HOUR } from "@/lib/trends/engine";
import { topicSnapshot } from "@/lib/trends/snapshots";
import { seedFixtures } from "@/lib/db/seed";
const { cachedReads } = vi.hoisted(() => ({ cachedReads: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: vi.fn((fn) => (...args: string[]) => { cachedReads(...args); return fn(...args); }) }));
vi.mock("@/lib/db/client", () => ({ getDatabase: vi.fn() }));
vi.mock("@/lib/server/env", async (original) => ({ ...await original<typeof import("@/lib/server/env")>(), getEnv: vi.fn() }));
import { unstable_cache } from "next/cache";
import { getDatabase } from "@/lib/db/client";
import { getEnv, parseEnv } from "@/lib/server/env";
import { readDashboard, readTopics, readTopic, readHealth, ReadUnavailableError } from "@/lib/server/queries";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as pulseRoute } from "@/app/api/pulse/route";

beforeEach(() => {
  cachedReads.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.mocked(getEnv).mockReturnValue(parseEnv({ APP_DATA_MODE: "live", TURSO_DATABASE_URL: "file:.data/test.db" }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Read endpoints must not fetch sources or AI"));
});
afterEach(() => { vi.useRealTimers(); });
async function setup() {
  const repo = testRepository(); await repo.initialize();
  vi.mocked(getDatabase).mockReturnValue(repo.client);
  const owner = (await repo.acquireLease(now))!;
  const signals = [observation("read-a", 0.25), observation("read-b", 1, "gdelt")].map((o) => ({ ...o, neighborhood: "Whitefield" as const }));
  await repo.publish([topic], signals, pulse(), owner, now);
  await repo.releaseLease(owner);
  return { repo, signals, reads: new ReadRepository(repo.client) };
}
describe("database-backed read service", () => {
  it("reads through an over-age cache instead of returning a stale snapshot after new collection", async () => {
    const { reads } = await setup(), fresh = await reads.load(now);
    const load = vi.spyOn(ReadRepository.prototype, "load")
      .mockResolvedValueOnce({ ...fresh, loadedAt: new Date(now.getTime() - 60_000).toISOString() })
      .mockResolvedValueOnce(fresh);
    const data = await readDashboard({ window: "2h" });
    expect(load).toHaveBeenCalledTimes(2);
    expect(data.snapshot).toMatchObject({ capturedAt: now.toISOString(), cacheAgeSeconds: 0, refreshDelayed: false });
    expect(data.topTopics).toHaveLength(1);
  });
  it("keeps validated evidence with a delay notice if the direct cache recovery read fails", async () => {
    const { reads } = await setup(), fresh = await reads.load(now);
    vi.spyOn(ReadRepository.prototype, "load")
      .mockResolvedValueOnce({ ...fresh, loadedAt: new Date(now.getTime() - 60_000).toISOString() })
      .mockRejectedValueOnce(new Error("PRIVATE_DB_DETAIL"));
    const data = await readDashboard({ window: "2h" });
    expect(data.snapshot.refreshDelayed).toBe(true);
    expect(data.topTopics).toHaveLength(1);
    expect(data.notice).toContain("Snapshot refresh is delayed");
    expect(JSON.stringify(data)).not.toContain("PRIVATE_DB_DETAIL");
  });
  it("separates persisted caches by database using opaque keys rather than URLs or credentials", async () => {
    await setup();
    await readDashboard(); await readTopic(topic.slug);
    const first = cachedReads.mock.calls[0]![0];
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(cachedReads.mock.calls.at(-1)).toEqual([first, topic.slug, now.toISOString()]);
    vi.mocked(getEnv).mockReturnValue(parseEnv({ APP_DATA_MODE: "live", TURSO_DATABASE_URL: "libsql://different.example", TURSO_AUTH_TOKEN: "PRIVATE_DB_TOKEN" }));
    await readDashboard();
    expect(cachedReads.mock.calls.at(-1)![0]).not.toBe(first);
    expect(JSON.stringify(cachedReads.mock.calls)).not.toMatch(/different\.example|PRIVATE_DB_TOKEN|file:/);
  });
  it("preserves retained topic briefs when the latest collection reports complete source failure", async () => {
    const { repo } = await setup();
    const stored = (await repo.latest())!;
    const payload = { ...stored, status: "unavailable", notice: "All sources are currently unavailable." };
    await repo.client.execute({ sql: "UPDATE pulse_snapshots SET payload=?", args: [JSON.stringify(payload)] });
    const detail = await readTopic(topic.slug);
    expect(detail).toMatchObject({ status: "unavailable", notice: "All sources are currently unavailable." });
    expect(detail?.sourceEvidence).toHaveLength(2);
    expect(await readTopic("missing-topic")).toBeNull();
  });
  it("reads persisted semantic categories independently of coarse editorial buckets", async () => {
    const { repo } = await setup();
    const record = (await repo.findTopicBySlug(topic.slug))!;
    await repo.client.execute({ sql: "INSERT INTO topic_enrichments(topic_id,semantic_category) VALUES (?,?)", args: [record.id, "business"] });
    const data = await readDashboard({ category: "business" });
    expect(data.topTopics).toHaveLength(1);
    expect(data.topTopics[0]).toMatchObject({ semanticCategory: "business", category: "Technology", neighborhood: "Whitefield" });
    expect(data.sourceStream).toHaveLength(2);
    expect(data.hotspots.map((h) => h.neighborhood)).toEqual(["Whitefield"]);
    expect((await readDashboard({ category: "technology" })).topTopics).toEqual([]);
    expect((await readDashboard({ category: "Technology" })).topTopics).toHaveLength(1);
  });
  it("uses a coherent read batch, isolates fixture rows and makes no source/model requests or writes", async () => {
    const { repo, reads } = await setup(); await seedFixtures(repo, now);
    const batch = vi.spyOn(repo.client, "batch");
    const state = await reads.load(now, topic.slug);
    expect(state.items).toHaveLength(2); expect(state.topics).toHaveLength(1); expect(state.history).toHaveLength(1);
    expect(batch).toHaveBeenCalledTimes(1); expect(batch.mock.calls[0]![1]).toBe("read");
    const d = projectDashboard(state, { window: "2h" }, now);
    expect(dashboardSchema.safeParse(d).success).toBe(true); expect(d.topTopics[0]).toMatchObject({ current2h: 2, sourceCount: 2 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await expect(reads.load(now, "x' OR 1=1 --")).rejects.toThrow(); expect(batch).toHaveBeenCalledTimes(1);
    expect((await reads.health(now)).recentSignalCount).toBe(2);
  });
  it("adds only one bounded history query to the shared atomic read for a topic brief", async () => {
    const { repo } = await setup();
    const batch = vi.spyOn(repo.client, "batch"), execute = vi.spyOn(repo.client, "execute");
    const detail = await readTopic(topic.slug);
    expect(detail?.sourceEvidence).toHaveLength(2);
    expect(detail?.history).toHaveLength(1);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]![0]).toHaveLength(7);
    expect(execute).toHaveBeenCalledTimes(3);
    for (const sql of ["sqlite_master", "source_collections", "LIMIT 97"]) expect(JSON.stringify(execute.mock.calls)).toContain(sql);
  });
  it("anchors separately loaded history to its parent snapshot and rejects invalid bounds before SQL", async () => {
    const { repo, reads, signals } = await setup();
    const record = (await repo.findTopicBySlug(topic.slug))!;
    await repo.saveSnapshots([60, 30].map((minutes) => topicSnapshot(record.id, signals, new Date(now.getTime() - minutes * 60000))));
    const ceiling = new Date(now.getTime() - 40 * 60000).toISOString();
    const history = await reads.loadHistory(now, topic.slug, ceiling);
    expect(history.history).toHaveLength(1);
    expect(history.history[0]!.capturedAt).toBe(new Date(now.getTime() - HOUR).toISOString());
    const execute = vi.spyOn(repo.client, "execute");
    await expect(reads.loadHistory(now, "bad'slug", ceiling)).rejects.toThrow();
    await expect(reads.loadHistory(now, topic.slug, new Date(now.getTime() + HOUR).toISOString())).rejects.toThrow("FUTURE_HISTORY_CEILING");
    expect(execute).not.toHaveBeenCalled();
  });
  it("serves retained inactive topics and versioned history while excluding them from the 2h dashboard", async () => {
    const { repo } = await setup(); vi.setSystemTime(new Date(now.getTime() + 3 * HOUR));
    const data = await readDashboard({ window: "2h" }); expect(data.topTopics).toEqual([]); expect(data.stale).toBe(true);
    const detail = await readTopic(topic.slug);
    expect(detail).toMatchObject({ lifecycle: "COOLING", pulseScore: 0, confidence: 0, stale: true });
    expect(detail?.history).toHaveLength(1); expect(detail?.sourceEvidence).toHaveLength(2);
    expect((await readDashboard({ window: "6h" })).topTopics[0]).toMatchObject({ activityCount: 2, score: 0 });
    expect((await repo.findTopicBySlug(topic.slug))?.pulseScore).toBeGreaterThan(0); // Reads never rewrite captured scores.
  });
  it("reports pending collected signals without assigning scores or invented topics", async () => {
    const { repo } = await setup(); await repo.insertItem(fromSignal(observation("pending", 0.01, "hackernews")));
    const dashboard = await readDashboard();
    expect(dashboard.signalCount).toBe(3);
    expect(dashboard.sourceStream[0]).toMatchObject({ enrichmentStatus: "pending", topicSlug: null });
    expect(dashboard.topTopics[0]!.current2h).toBe(2); expect(dashboard.topTopics[0]!.sourceCount).toBe(2);
    const filtered = await readDashboard({ category: "Technology" });
    expect(filtered.sourceStream.some((s) => s.enrichmentStatus === "pending")).toBe(false);
    expect((await readHealth()).recentSignalCount).toBe(3);
  });
  it("returns latest ingestion separately from the last successful poll and sanitizes source errors", async () => {
    const { repo } = await setup();
    const successful = await repo.startIngestionRun("gdelt", new Date(now.getTime() - HOUR));
    const successAt = new Date(now.getTime() - 0.5 * HOUR).toISOString();
    await repo.completeIngestionRun(successful.id, { finishedAt: successAt, status: "completed", discovered: 0, inserted: 0, duplicates: 0, errors: 0, errorMessage: null });
    const failed = await repo.startIngestionRun("bluesky", new Date(now.getTime() - 0.1 * HOUR));
    await repo.completeIngestionRun(failed.id, { finishedAt: now.toISOString(), status: "failed", discovered: 0, inserted: 0, duplicates: 0, errors: 1,
      errorMessage: "SECRET_SENTINEL libsql://private.example authToken=private" });
    const dashboard = await readDashboard(), health = await readHealth();
    expect(dashboard.lastSuccessfulIngestion).toBe(successAt);
    expect(health).toMatchObject({ database: { status: "ok" }, lastSuccessfulIngestion: successAt, lastIngestion: { source: "bluesky", status: "failed" }, status: "degraded" });
    expect(health.sources.find((s) => s.source === "bluesky")?.status).toBe("error");
    expect(JSON.stringify([dashboard, health])).not.toContain("SECRET_SENTINEL");
  });
  it("probes the database for health even after a successful dashboard read, with opaque outage responses", async () => {
    const { repo } = await setup(); expect((await readDashboard()).topTopics).toHaveLength(1);
    vi.spyOn(repo.client, "batch").mockRejectedValue(new Error("SECRET_SENTINEL private Turso credential"));
    const health = await readHealth();
    expect(health).toMatchObject({ application: { status: "ok" }, database: { status: "unavailable" }, status: "unavailable", recentSignalCount: null });
    const dashboard = await readDashboard(); expect(dashboard.status).toBe("unavailable"); expect(dashboard.mode).toBe("live");
    await expect(readTopic(topic.slug)).rejects.toBeInstanceOf(ReadUnavailableError);
    expect(JSON.stringify([health, dashboard, vi.mocked(console.error).mock.calls])).not.toContain("SECRET_SENTINEL");
  });
  it("validates parameters before database access and uses fixed bounded server revalidation", async () => {
    vi.mocked(getDatabase).mockClear();
    await expect(readDashboard({ window: "12h" } as never)).rejects.toThrow();
    await expect(readTopic("Bad Slug")).rejects.toThrow();
    expect(getDatabase).not.toHaveBeenCalled();
    const options = vi.mocked(unstable_cache).mock.calls.map((call) => call[2]);
    expect(options).toEqual([{ revalidate: 15 }, { revalidate: 15 }]);
  });
  it("honestly handles unconfigured live reads, empty databases, malformed persisted data and demo mode", async () => {
    vi.mocked(getEnv).mockReturnValue(parseEnv({ APP_DATA_MODE: "live" }));
    expect((await readDashboard()).generatedAt).toBeNull(); expect((await readHealth()).database.status).toBe("unconfigured");
    const repo = testRepository(); await repo.initialize(); vi.mocked(getDatabase).mockReturnValue(repo.client);
    vi.mocked(getEnv).mockReturnValue(parseEnv({ APP_DATA_MODE: "live", TURSO_DATABASE_URL: "file:.data/test.db" }));
    expect((await readHealth()).database.status).toBe("ok"); expect((await readHealth()).status).toBe("unavailable");
    expect(await readDashboard()).toMatchObject({ mode: "live", generatedAt: null, topTopics: [], sourceStream: [], totalSignals: 0 });
    const emptyHealth = await healthRoute(); expect(emptyHealth.status).toBe(503);
    expect(await emptyHealth.json()).toMatchObject({ application: { status: "ok" }, database: { status: "ok" }, recentSignalCount: 0 });
    await repo.client.execute({ sql: "INSERT INTO pulse_snapshots(id,captured_at,mode,payload) VALUES (?,?,?,?)", args: ["corrupt", now.toISOString(), "live", "{}"] });
    expect((await readDashboard()).status).toBe("unavailable"); expect((await readHealth()).database.status).toBe("unavailable");
    vi.mocked(getEnv).mockReturnValue(parseEnv({ APP_DATA_MODE: "demo" }));
    const demo = await readDashboard(); expect(demo.mode).toBe("demo"); expect(demo.topTopics).toHaveLength(6);
    expect((await readHealth()).database.status).toBe("not_required"); expect(demo.lastSuccessfulIngestion).toBeNull();
  });
  it.each([undefined, "invalid"])("serves live Vercel reads without usable worker settings (%s)", async (workerSetting) => {
    const { repo } = await setup();
    vi.mocked(getEnv).mockReturnValue(parseEnv({ VERCEL: "1", TURSO_DATABASE_URL: "libsql://example.turso.io",
      TURSO_AUTH_TOKEN: "PRIVATE_DB_TOKEN", ENRICHMENT_PROVIDER: workerSetting, AI_BATCH_SIZE: workerSetting,
      OPENAI_API_KEY: undefined, XKIRO_API_KEY: undefined }));
    expect((await pulseRoute()).status).toBe(200);
    const healthy = await healthRoute(); expect(healthy.status).toBe(200);
    expect(await healthy.json()).toMatchObject({ mode: "live", database: { status: "ok" }, simulated: false });
    vi.spyOn(repo.client, "batch").mockRejectedValue(new Error("PRIVATE_DB_TOKEN libsql://private.example"));
    const failed = await healthRoute(); expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ application: { status: "ok" }, database: { status: "unavailable" }, recentSignalCount: null });
    const unavailable = await pulseRoute(); expect(unavailable.status).toBe(503);
    const data = await unavailable.json(); expect(data).toMatchObject({ mode: "live", topTopics: [], notice: "Live data is temporarily unavailable." });
    expect(JSON.stringify([data, vi.mocked(console.error).mock.calls])).not.toContain("PRIVATE_DB_TOKEN");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("rejects a valid payload with mismatched snapshot identity instead of leaking a fixture into live mode", async () => {
    const { repo, reads } = await setup();
    await repo.client.execute({ sql: "UPDATE pulse_snapshots SET payload=?", args: [JSON.stringify(demoReadState(now).snapshot)] });
    await expect(reads.load(now)).rejects.toThrow("SNAPSHOT_IDENTITY_MISMATCH");
    expect((await readDashboard()).status).toBe("unavailable"); expect((await readHealth()).status).toBe("unavailable");
  });
  it("preserves global duplicate protection when the earliest syndicated copy is older than 24 hours", async () => {
    const state = demoReadState(now, "namma-metro"), original = state.items.find((i) => i.topicId === "demo-namma-metro")!;
    const older = { ...original, id: "historical-copy", sourceId: "historical-copy", contentFingerprint: "legacy-hash",
      canonicalUrl: "https://example.org/historical", originalUrl: "https://example.org/historical", domain: "example.org",
      publishedAt: new Date(now.getTime() - 25 * HOUR).toISOString() };
    const withOldCopy = { ...state, items: [...state.items, older] };
    const before = projectDashboard(state, { window: "2h" }, now), after = projectDashboard(withOldCopy, { window: "2h" }, now);
    expect(after.signalCount).toBe(before.signalCount - 1);
    expect(after.topTopics.find((t) => t.slug === "namma-metro")!.current2h).toBe(before.topTopics.find((t) => t.slug === "namma-metro")!.current2h - 1);
  });
  it("caps excerpts/evidence/history and reports truncation while retaining exact counts", async () => {
    const { repo, reads, signals } = await setup();
    const record = (await repo.findTopicBySlug(topic.slug))!;
    await repo.saveSnapshots(Array.from({ length: 100 }, (_, i) => {
      const delta = (100 - i) * 60000, date = new Date(now.getTime() - delta);
      return topicSnapshot(record.id, signals.map((o) => ({ ...o, publishedAt: new Date(Date.parse(o.publishedAt) - delta).toISOString() })), date);
    }));
    const state = await reads.load(now, topic.slug), detail = projectTopic(state, topic.slug, now)!;
    expect(state.historyTruncated).toBe(true); expect(detail.history).toHaveLength(96);
    expect(detail.history[0]!.capturedAt <= detail.history.at(-1)!.capturedAt).toBe(true);
    expect(topicDetailSchema.safeParse(detail).success).toBe(true);
    expect((await repo.fetchTopicHistory(record.id))).toHaveLength(101);
    const demo = demoReadState(now), long = { ...demo, items: demo.items.map((i) => ({ ...i, excerpt: "long excerpt ".repeat(150) })) };
    const d = projectDashboard(long, readQuerySchema.parse({ window: "24h" }), now);
    expect(d.sourceStream[0]!.excerpt).toHaveLength(600); expect(d.signalCount).toBe(221); expect(d.streamTruncated).toBe(true);
  });
  it("averages each distinct hotspot topic once and leaves unknown locations out", () => {
    const state = demoReadState(now), changed = { ...state, items: state.items.map((i) => ({ ...i, neighborhood: "Whitefield" as const })) };
    const data = projectDashboard(changed, { window: "2h" }, now), hotspot = data.hotspots[0]!;
    expect(hotspot.activity).toBe(79); expect(hotspot.topPulse).toBe(data.topTopics[0]!.score);
    expect(hotspot.averagePulse).toBe(Math.round(data.topTopics.reduce((sum, t) => sum + t.score, 0) / 6 * 10) / 10);
    expect(projectDashboard({ ...changed, items: changed.items.map((i) => ({ ...i, neighborhood: null })) }, { window: "2h" }, now).hotspots).toEqual([]);
  });
  it("exposes an isolated neighborhood mention without promoting its topic into the ranking", () => {
    const state = demoReadState(now), located = state.items.find((i) => i.neighborhood && Date.parse(i.publishedAt) > now.getTime() - 2 * HOUR)!;
    const data = projectDashboard({ ...state, items: [located] }, { window: "2h" }, now);
    expect(data.topTopics).toEqual([]); expect(data.hotspots).toHaveLength(1);
    expect(data.hotspots[0]!.activity).toBe(1); expect(data.hotspots[0]!.topPulse).toBeLessThanOrEqual(20);
  });
  it("reports stale source availability and keeps the original collection timestamp", async () => {
    const { reads } = await setup(), staleAt = new Date(now.getTime() + 2 * HOUR);
    const state = await reads.load(staleAt), dashboard = projectDashboard(state, { window: "6h" }, staleAt);
    expect(dashboard.generatedAt).toBe(now.toISOString()); expect(dashboard.evaluatedAt).toBe(staleAt.toISOString());
    expect(dashboard.stale).toBe(true); expect(dashboard.availableSources).toEqual([]);
    const health = projectHealth(await reads.health(staleAt), staleAt);
    expect(health.stale).toBe(true); expect(health.status).toBe("degraded");
  });
  it("marks delayed revalidation honestly without changing the collection timestamp", async () => {
    const { reads } = await setup(), state = await reads.load(now), later = new Date(now.getTime() + 31 * 1000);
    const dashboard = projectDashboard(state, { window: "2h" }, later);
    expect(dashboard).toMatchObject({ status: "degraded", generatedAt: now.toISOString(), stale: false,
      snapshot: { cacheAgeSeconds: 31, refreshDelayed: true } });
    expect(dashboard.notice).toContain("showing the last available snapshot");
  });
  it("filters the full topic set before limiting and retains the 100-topic list contract", async () => {
    const repo = testRepository(); await repo.initialize(); vi.mocked(getDatabase).mockReturnValue(repo.client);
    const descriptors = Array.from({ length: 101 }, (_, i) => ({ ...topic, slug: "topic-" + String(i).padStart(3, "0"), title: "Canonical subject " + i }));
    const signals = descriptors.flatMap((t) => [observation(t.slug + "-a", 0.25, "bluesky", t.slug), observation(t.slug + "-b", 1, "gdelt", t.slug)]);
    const owner = (await repo.acquireLease(now))!; await repo.publish(descriptors, signals, pulse(), owner, now);
    const dashboard = await readDashboard(); expect(dashboard.topTopics).toHaveLength(50); expect(dashboard.topicsTruncated).toBe(true);
    const all = await readTopics({ limit: 100 }); expect(all.topics).toHaveLength(100); expect(all.total).toBe(101);
    const last = await readTopics({ q: "Canonical subject 100", limit: 1 }); expect(last.topics[0]!.slug).toBe("topic-100"); expect(last.total).toBe(1);
  });
});
