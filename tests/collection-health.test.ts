import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionRecordSchema, collectionState, type CollectionRecord } from "@/lib/domain/source-health";
import { checkpointCollection, readCollections } from "@/lib/db/collection-repository";
import { ReadRepository } from "@/lib/db/read-repository";
import { publicSources, projectDashboard, demoReadState } from "@/lib/server/projections";
import { ingest } from "@/lib/pipeline/ingest";
import { type SourceStatus, type Source } from "@/lib/domain/schema";
import type { SourceAdapter } from "@/lib/sources/types";
import { fromSignal } from "@/lib/db/mapping";
import { meaningfulWindow } from "@/lib/trends/window-selection";
import { formatDate, formatTime } from "@/lib/format";
import { testRepository } from "./database";
import { migrate, loadMigrations } from "@/lib/db/schema";
import { now, observation } from "./helpers";

const health = (status: SourceStatus["status"] = "ok"): SourceStatus => ({ source: "gdelt", status,
  fetched: 0, accepted: 0, rejected: 0, durationMs: 3, checkedAt: now.toISOString() });
const record = (changes: Partial<CollectionRecord> = {}) => collectionRecordSchema.parse({ health: health(),
  lastAttemptAt: now.toISOString(), lastSuccessAt: now.toISOString(), lastItemAt: null,
  lastErrorAt: null, lastErrorType: null, itemsLastRun: 0, ...changes });
const emptyAdapters = (): Record<Source, SourceAdapter> => {
  const adapter = (source: Source): SourceAdapter => async () => ({ signals: [], health: { ...health(), source } });
  return { gdelt: adapter("gdelt"), bluesky: adapter("bluesky"), hackernews: adapter("hackernews"), currents: adapter("currents") };
};

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("collection health is independent of activity and enrichment", () => {
  it("counts consecutive problem polls idempotently and resets on successful empty collection", async () => {
    const repo = testRepository(); await repo.initialize();
    await checkpointCollection(repo.client, health("error"), [], false, now);
    await checkpointCollection(repo.client, health("error"), [], false, now);
    expect((await readCollections(repo.client, now, false))[0]?.consecutiveFailures).toBe(1);
    const later = new Date(now.getTime() + 60000);
    await checkpointCollection(repo.client, { ...health("partial"), checkedAt: later.toISOString() }, [], false, later);
    expect((await readCollections(repo.client, later, false))[0]?.consecutiveFailures).toBe(2);
    const success = new Date(later.getTime() + 60000);
    await checkpointCollection(repo.client, { ...health(), checkedAt: success.toISOString() }, [], false, success);
    expect((await readCollections(repo.client, success, false))[0]?.consecutiveFailures).toBe(0);
  });
  it("retains known historical success when upgrading before a failed new poll", async () => {
    const repo = testRepository(); await migrate(repo.client, loadMigrations().slice(0, 6), now);
    const succeededAt = new Date(now.getTime() - 10 * 60_000), failedAt = new Date(now.getTime() - 5 * 60_000);
    const succeeded = await repo.startIngestionRun("gdelt", succeededAt, false);
    await repo.completeIngestionRun(succeeded.id, { status: "completed", finishedAt: succeededAt.toISOString(), discovered: 0, inserted: 0, duplicates: 0, errors: 0, errorMessage: null });
    const failed = await repo.startIngestionRun("gdelt", failedAt, false);
    await repo.completeIngestionRun(failed.id, { status: "failed", finishedAt: failedAt.toISOString(), discovered: 0, inserted: 0, duplicates: 0, errors: 1, errorMessage: "PRIVATE_UPSTREAM_DETAIL" });
    await repo.initialize();
    await checkpointCollection(repo.client, health("error"), [], false, now);
    const rows = await readCollections(repo.client, now, false);
    expect(rows[0]?.lastSuccessAt).toBe(succeededAt.toISOString());
    expect(publicSources([], [], now, "live", rows)[0]?.healthState).toBe("degraded");
    expect(JSON.stringify(rows)).not.toContain("PRIVATE_UPSTREAM_DETAIL");
  });
  it("keeps a successful empty poll live, including an explicitly empty 2h window", () => {
    expect(collectionState(record(), now.getTime())).toBe("live");
    const state = demoReadState(now);
    const pulse = projectDashboard({ ...state, mode: "live", items: [], collections: [record()] }, { window: "2h" }, now);
    expect(pulse.signalCount).toBe(0);
    expect(pulse.sources.find((source) => source.source === "gdelt")).toMatchObject({ healthState: "live", stale: false, itemsLastRun: 0 });
    expect(pulse.availableSources).toContain("gdelt");
  });
  it.each([[45, "live"], [46, "delayed"], [90, "delayed"], [91, "stale"]] as const)("classifies %s minutes since success as %s", (minutes, expected) => {
    expect(collectionState(record(), now.getTime() + minutes * 60_000)).toBe(expected);
  });
  it("distinguishes recent partial coverage, recent failures and exhausted coverage", () => {
    expect(collectionState(record({ health: health("partial") }), now.getTime())).toBe("degraded");
    expect(collectionState(record({ health: health("error") }), now.getTime() + 60_000)).toBe("degraded");
    expect(collectionState(record({ health: health("error") }), now.getTime() + 91 * 60_000)).toBe("error");
    expect(collectionState(record({ health: health("error"), lastSuccessAt: null }), now.getTime())).toBe("error");
    expect(collectionState(record(), now.getTime() - 1)).toBe("unavailable");
  });
  it("preserves last success and last item across an empty poll and a later failure", async () => {
    const repo = testRepository(); await repo.initialize();
    const signal = observation("collected-item", 1, "gdelt");
    await checkpointCollection(repo.client, { ...health(), accepted: 1, fetched: 1 }, [signal], false, now);
    const emptyAt = new Date(now.getTime() + 10 * 60_000);
    await checkpointCollection(repo.client, { ...health(), checkedAt: emptyAt.toISOString() }, [], false, emptyAt);
    const failedAt = new Date(now.getTime() + 20 * 60_000);
    await checkpointCollection(repo.client, { ...health("error"), checkedAt: failedAt.toISOString(), error: "HTTP_429" }, [], false, failedAt);
    const rows = await readCollections(repo.client, failedAt, false);
    expect(rows[0]).toMatchObject({ lastSuccessAt: emptyAt.toISOString(), lastItemAt: signal.publishedAt,
      lastAttemptAt: failedAt.toISOString(), lastErrorAt: failedAt.toISOString(), lastErrorType: "HTTP_429", itemsLastRun: 0 });
    expect(publicSources([], [], failedAt, "live", rows)[0]).toMatchObject({ healthState: "degraded", stale: false });
    expect(await readCollections(repo.client, failedAt, true)).toEqual([]);
  });
  it("does not replace collection success with a later publication failure", async () => {
    vi.stubEnv("ENRICHMENT_PROVIDER", "heuristic");
    const repo = testRepository();
    vi.spyOn(repo, "publish").mockRejectedValue(new Error("PUBLICATION_FAILED"));
    await expect(ingest({ repository: repo, now, adapters: emptyAdapters() })).rejects.toThrow("PUBLICATION_FAILED");
    const state = await new ReadRepository(repo.client).load(now);
    expect(state.sourceRuns.every((run) => run.status === "failed")).toBe(true);
    expect(publicSources([], state.sourceRuns, now, "live", state.collections).every((source) => source.healthState === "live")).toBe(true);
    expect(state.snapshot).toBeNull();
  });
  it("recovers processable pending items even after all three API attempts were consumed", async () => {
    vi.stubEnv("ENRICHMENT_PROVIDER", "xkiro"); vi.stubEnv("XKIRO_API_KEY", "");
    const repo = testRepository(); await repo.initialize();
    const signal = { ...observation("exhausted", 1), title: "Bengaluru metro services delayed", excerpt: "Bengaluru metro services delayed" };
    await repo.insertItem(fromSignal(signal));
    await repo.client.execute("UPDATE items SET enrichment_attempts=3");
    const api = vi.fn(async () => new Map());
    const result = await ingest({ repository: repo, now, adapters: emptyAdapters(), enrich: api });
    expect(api).not.toHaveBeenCalled();
    expect(result.pulse?.enrichment).toMatchObject({ pending: 0, completed: 1,
      run: { selectedProvider: "xkiro", actualProviders: ["heuristic"], aiEnriched: 0, heuristicEnriched: 1, fallbackCount: 1 } });
    expect((await repo.load(now)).items[0]?.enrichmentProvider).toBe("heuristic");
    expect((await readCollections(repo.client, now, false)).every((row) => collectionState(row, now.getTime()) === "live")).toBe(true);
  });
  it("reads pre-migration databases without migrating them", async () => {
    const repo = testRepository(); await repo.initialize();
    await repo.client.execute("DROP TABLE source_collections");
    const execute = vi.spyOn(repo.client, "execute");
    expect(await readCollections(repo.client, now, false)).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toContain("SELECT");
  });
});

describe("NOW uses the shortest meaningful evidence window", () => {
  it("falls back honestly to 24h and preserves an explicit empty 2h selection", () => {
    const state = demoReadState(now), later = new Date(now.getTime() + 3 * 3_600_000);
    const smart = projectDashboard(state, { window: "now" }, later);
    const exact = projectDashboard(state, { window: "2h" }, later);
    expect(smart).toMatchObject({ requestedWindow: "now", window: "24h", snapshot: { scoringWindow: "2h", queryWindow: "24h" } });
    expect(smart.topTopics.length).toBeGreaterThan(0);
    expect(smart.topTopics.every((topic) => topic.current2h === 0)).toBe(true);
    expect(exact).toMatchObject({ window: "2h", requestedWindow: "2h", topTopics: [], sourceStream: [] });
  });
  it("widens to 24h, respects source/category filters and never replays expired evidence", () => {
    const state = demoReadState(now), later = new Date(now.getTime() + 8 * 3_600_000);
    const pulse = projectDashboard(state, { window: "now", source: "gdelt", category: "food" }, later);
    expect(pulse.window).toBe("24h");
    expect(pulse.topTopics.every((topic) => topic.semanticCategory === "food")).toBe(true);
    expect(pulse.sourceStream.every((signal) => signal.source === "gdelt")).toBe(true);
    const expired = projectDashboard(state, { window: "now" }, new Date(now.getTime() + 30 * 3_600_000));
    expect(expired).toMatchObject({ window: "24h", sourceStream: [], topTopics: [], totalSignals: 0 });
  });
  it("prefers qualifying topics, otherwise 24h, and has a deterministic quiet default", () => {
    expect(meaningfulWindow([{ window: "2h", topics: 0, signals: 1 }, { window: "6h", topics: 1, signals: 8 }])).toBe("6h");
    expect(meaningfulWindow([{ window: "2h", topics: 0, signals: 0 }, { window: "6h", topics: 0, signals: 1 }])).toBe("24h");
    expect(meaningfulWindow([])).toBe("24h");
  });
  it("formats UTC observations in IST across midnight without changing their stored timestamp", () => {
    const at = "2026-10-17T20:00:00.000Z";
    expect(formatTime(at)).toBe("01:30"); expect(formatDate(at)).toBe("18 Oct 2026");
    expect(Date.parse(at)).toBe(Date.UTC(2026, 9, 17, 20));
  });
});
