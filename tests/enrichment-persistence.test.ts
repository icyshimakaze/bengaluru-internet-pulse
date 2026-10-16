import { afterEach, describe, expect, it, vi } from "vitest";
import { testRepository } from "./database";
import { now, observation } from "./helpers";
import { classifyAI } from "@/lib/pipeline/ai";
import { ingest } from "@/lib/pipeline/ingest";
import { fromSignal } from "@/lib/db/mapping";
import { loadMigrations, migrate } from "@/lib/db/schema";
import { type Source } from "@/lib/domain/schema";
import { type SourceAdapter } from "@/lib/sources/adapters";
import { DAY } from "@/lib/db/data-repository";

function adapters(count = 2): Record<Source, SourceAdapter> {
  const adapter = (source: Source): SourceAdapter => async () => ({
    signals: Array.from({ length: count }, (_, n) => {
      const text = n % 2 ? "Bangalore metro service delayed" : "Bengaluru metro service delays";
      const excerpt = `${text}. Independent signal reference ${source} ${n}.`;
      return { ...observation(`${source}-${n}`, 1, source), title: text, text: excerpt, excerpt };
    }), health: { source, status: "ok", fetched: count, accepted: count, rejected: 0, durationMs: 0, checkedAt: now.toISOString() },
  });
  return { gdelt: adapter("gdelt"), bluesky: adapter("bluesky"), hackernews: adapter("hackernews") };
}
const mock: typeof classifyAI = (signals, topics) => classifyAI(signals, topics, { provider: "heuristic" });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("durable semantic enrichment queue", () => {
  it("never sends completed items again and retains heuristic provenance separately from trend confidence", async () => {
    const repo = testRepository(), enrich = vi.fn(mock);
    const first = await ingest({ repository: repo, now, adapters: adapters(), enrich });
    await ingest({ repository: repo, now, adapters: adapters(), enrich });
    expect(enrich).toHaveBeenCalledTimes(1);
    const data = await repo.load(now);
    expect(data.items).toHaveLength(6); expect(data.topicRecords).toHaveLength(1);
    expect(data.items.every((i) => i.enrichmentStatus === "completed")).toBe(true);
    const metadata = await repo.enrichment.find(data.items[0]!.id);
    expect(metadata).toMatchObject({ provider: "heuristic", model: null, result: { category: "traffic", neighborhood: "Citywide" } });
    expect(data.items.every((i) => i.enrichmentProvider === "heuristic")).toBe(true);
    expect(data.topicRecords[0]!.confidence).toBe(first.pulse!.trends[0]!.confidence);
    expect(data.topicRecords[0]!.confidence).not.toBe(metadata!.result.confidence);
    expect(first.pulse?.notice).toContain("deterministic heuristic");
    // Even repeated capture timestamps must retain each invocation's counters.
    expect((await repo.enrichment.recentRuns()).map((run) => run.report.attempted)).toEqual([0, 6]);
    expect(await repo.fetchHotspotActivity({ since: new Date(now.getTime() - DAY), until: now })).toEqual([]);
  });
  it("retains unprocessed signals and recovers them after cooldown without duplicating collection", async () => {
    const repo = testRepository();
    const failed = await ingest({ repository: repo, now, adapters: adapters(), enrich: async () => new Map() });
    expect(failed).toMatchObject({ added: 6, pulse: { status: "degraded", totalSignals: 0, trends: [] } });
    expect((await repo.load(now)).items.every((i) => i.enrichmentStatus === "pending")).toBe(true);
    const enrich = vi.fn(mock);
    await ingest({ repository: repo, now: new Date(now.getTime() + 5 * 60000), adapters: adapters(), enrich });
    expect(enrich).not.toHaveBeenCalled();
    expect((await repo.latest())?.enrichment).toMatchObject({ provider: "none", pending: 6, completed: 0 });
    expect((await repo.latest())?.status).toBe("degraded");
    const recovered = await ingest({ repository: repo, now: new Date(now.getTime() + 15 * 60000), adapters: adapters(), enrich });
    expect(recovered.added).toBe(0); expect(recovered.pulse?.totalSignals).toBe(6);
    expect(enrich).toHaveBeenCalledTimes(1);
    const data = await repo.load(new Date(now.getTime() + 15 * 60000));
    expect(data.items).toHaveLength(6); expect(data.observations).toHaveLength(6);
    expect((await repo.ingestionStatus()).filter((r) => r.inserted === 2)).toHaveLength(3);
  });
  it("limits each item's paid-capable enrichment to three runs and enforces retry cooldown", async () => {
    const repo = testRepository(), enrich = vi.fn(async () => new Map());
    for (const minutes of [0, 5, 15, 30, 45]) await ingest({ repository: repo, now: new Date(now.getTime() + minutes * 60000), adapters: adapters(), enrich });
    expect(enrich).toHaveBeenCalledTimes(3);
    const attempts = (await repo.client.execute("SELECT enrichment_attempts FROM items")).rows;
    expect(attempts.every((r) => r.enrichment_attempts === 3)).toBe(true);
    expect((await repo.load(new Date(now.getTime() + 45 * 60000))).items.every((i) => i.enrichmentStatus === "pending")).toBe(true);
  });
  it("saves every new signal while bounding enrichment work and lets later polls drain the queue", async () => {
    vi.stubEnv("MAX_AI_ITEMS_PER_RUN", "4"); vi.stubEnv("AI_BATCH_SIZE", "2");
    const repo = testRepository(), enrich = vi.fn(mock);
    const first = await ingest({ repository: repo, now, adapters: adapters(10), enrich });
    expect(first.added).toBe(30);
    const firstData = await repo.load(now);
    expect(firstData.items.filter((i) => i.enrichmentStatus === "completed")).toHaveLength(4);
    expect(firstData.items.filter((i) => i.enrichmentStatus === "pending")).toHaveLength(26);
    const second = await ingest({ repository: repo, now, adapters: adapters(10), enrich });
    expect(second.added).toBe(0);
    expect((await repo.load(now)).items.filter((i) => i.enrichmentStatus === "completed")).toHaveLength(8);
    expect(enrich.mock.calls.every(([signals]) => signals.length === 4)).toBe(true);
  });
  it("fetches unranked active topic IDs from 24 hours and excludes older and other dataset topics", async () => {
    const repo = testRepository(); await repo.initialize();
    for (const [slug, hours, isFixture] of [["recent-topic", 20, false], ["old-topic", 25, false], ["fixture-topic", 1, true]] as const) {
      const at = new Date(now.getTime() - hours * 3600000).toISOString();
      const topic = await repo.createTopic({ slug, canonicalLabel: "Bengaluru metro", category: "Mobility", firstSeenAt: at, lastSeenAt: at, summary: "Public discussion", isFixture });
      await repo.insertItem(fromSignal(observation(`catalog-${slug}`, hours), { topicId: topic.id, category: "Mobility", localRelevance: 1, enrichmentStatus: "completed", isFixture }));
    }
    const active = await repo.enrichment.activeTopics(now, false);
    expect(active.map((t) => t.slug)).toEqual(["recent-topic"]);
    expect(active[0]).toMatchObject({ category: "traffic", canonical_label: "Bengaluru metro" });
    expect(await repo.listActiveTopics({ now })).toHaveLength(0);
  });
  it("claims fresh unattempted evidence before older backlog while preserving cooldown and retry limits", async () => {
    const repo = testRepository(); await repo.initialize();
    for (const [id, hours] of [["old-backlog", 20], ["fresh-signal", 0.1]] as const) await repo.insertItem(fromSignal(observation(id, hours)));
    const owner = await repo.acquireLease(now);
    const claimed = await repo.enrichment.claimPending(now, false, 1, owner!);
    expect(claimed.map((item) => item.sourceId)).toEqual(["fresh-signal"]);
    expect((await repo.enrichment.claimPending(now, false, 1, owner!)).map((item) => item.sourceId)).toEqual(["old-backlog"]);
    await repo.releaseLease(owner!);
  });
  it("rejects malformed injected results before any enrichment or topic reaches the database", async () => {
    const repo = testRepository();
    await ingest({ repository: repo, now, adapters: adapters(), enrich: async (signals, topics) => {
      const result = await mock(signals, topics);
      for (const [id, assignment] of result) result.set(id, { ...assignment, result: { ...assignment.result, neighborhood: "Hebbal", summary: "A fabricated earthquake happened." } });
      return result;
    } });
    const data = await repo.load(now);
    expect(data.items).toHaveLength(6); expect(data.items.every((i) => i.enrichmentStatus === "pending")).toBe(true);
    expect(data.topicRecords).toHaveLength(0);
    expect((await repo.client.execute("SELECT * FROM item_enrichments")).rows).toHaveLength(0);
  });
  it("does not consume attempts in off mode and preserves unprocessed signals", async () => {
    vi.stubEnv("ENRICHMENT_ENABLED", "false"); const repo = testRepository();
    await ingest({ repository: repo, now, adapters: adapters() });
    expect((await repo.load(now)).items).toHaveLength(6);
    expect((await repo.client.execute("SELECT enrichment_attempts FROM items")).rows.every((r) => r.enrichment_attempts === 0)).toBe(true);
    expect((await repo.load(now)).observations).toHaveLength(0);
  });
  it("uses heuristic fallback when OpenAI credentials are missing and persists honest run counters", async () => {
    vi.stubEnv("ENRICHMENT_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "");
    const repo = testRepository();
    const result = await ingest({ repository: repo, now, adapters: adapters() });
    expect(result.added).toBe(6); expect(result.pulse?.enrichment).toMatchObject({ provider: "heuristic", pending: 0, completed: 6,
      run: { selectedProvider: "openai", actualProviders: ["heuristic"], aiEnriched: 0, heuristicEnriched: 6, providerErrors: 1, fallbackCount: 6 } });
    const history = await repo.enrichment.recentRuns();
    expect(history[0]?.report).toEqual(result.pulse?.enrichment?.run);
    expect((await repo.load(now)).items.every((i) => i.enrichmentProvider === "heuristic")).toBe(true);
  });
  it("forces heuristic processing for fixtures even if both environment and caller select API providers", async () => {
    vi.stubEnv("ENRICHMENT_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "");
    const repo = testRepository();
    const result = await ingest({ repository: repo, now, mode: "demo", enrichmentProvider: "xkiro", adapters: adapters() });
    expect(result.pulse?.enrichment).toMatchObject({ provider: "heuristic", completed: 6, pending: 0 });
    expect((await repo.load(now, true)).items.every((i) => i.enrichmentStatus === "completed")).toBe(true);
  });
  it("adds migration 4 to existing databases without losing data or changing prior migration checksums", async () => {
    const repo = testRepository(); await migrate(repo.client, loadMigrations().slice(0, 3), now);
    const signal = observation("existing", 1), item = fromSignal(signal);
    await repo.insertItem(item);
    const checksums = (await repo.client.execute("SELECT checksum FROM schema_migrations ORDER BY version")).rows;
    expect(await repo.initialize()).toEqual({ applied: [4, 5, 6], version: 6 });
    expect((await repo.load(now)).items).toEqual([item]);
    expect((await repo.client.execute("SELECT checksum FROM schema_migrations WHERE version<=3 ORDER BY version")).rows).toEqual(checksums);
    expect((await repo.client.execute("SELECT enrichment_attempts FROM items")).rows[0]?.enrichment_attempts).toBe(0);
  });
  it("prunes enrichment metadata with retained items and validates persisted enrichment reads", async () => {
    const repo = testRepository(); await ingest({ repository: repo, now, adapters: adapters(), enrich: mock });
    const itemId = (await repo.load(now)).items[0]!.id;
    const good = await repo.enrichment.find(itemId);
    await repo.client.execute({ sql: "UPDATE item_enrichments SET payload=? WHERE item_id=?", args: [JSON.stringify({ ...good!.result, confidence: 2 }), itemId] });
    await expect(repo.enrichment.find(itemId)).rejects.toThrow();
    const pruned = await repo.pruneOldData(new Date(now.getTime() + 15 * DAY));
    expect(pruned.items).toBe(6); expect((await repo.client.execute("SELECT * FROM item_enrichments")).rows).toHaveLength(0);
    expect((await repo.client.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
  });
  it("persists a vendor-prefixed xKiro model and actual item/run provider without calling an API", async () => {
    const repo = testRepository();
    const result = await ingest({ repository: repo, now, adapters: adapters(), enrichmentProvider: "xkiro", enrich: async (signals, topics) => {
      const values = await mock(signals, topics);
      return new Map([...values].map(([id, assignment]) => [id, { ...assignment, provider: "xkiro" as const, model: "google/test-model" }]));
    } });
    const data = await repo.load(now);
    expect(data.items.every((i) => i.enrichmentProvider === "xkiro")).toBe(true);
    expect(await repo.enrichment.find(data.items[0]!.id)).toMatchObject({ provider: "xkiro", model: "google/test-model" });
    expect(result.pulse?.enrichment).toMatchObject({ provider: "xkiro", run: { selectedProvider: "xkiro", aiEnriched: 6, heuristicEnriched: 0, fallbackCount: 0 } });
    const report = (await repo.enrichment.recentRuns())[0]!.report;
    expect(report).toEqual(result.pulse?.enrichment?.run);
    await repo.client.execute({ sql: "UPDATE enrichment_runs SET payload=?", args: [JSON.stringify({ ...report, aiEnriched: 99 })] });
    await expect(repo.enrichment.recentRuns()).rejects.toThrow();
    await repo.pruneOldData(new Date(now.getTime() + 31 * DAY));
    expect((await repo.client.execute("SELECT * FROM enrichment_runs")).rows).toHaveLength(0);
  });
});
