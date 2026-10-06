import { describe, expect, it, vi } from "vitest";
import { testRepository as repository } from "./database";
import { ingest } from "@/lib/pipeline/ingest";
import { type Source } from "@/lib/domain/schema";
import { type SourceAdapter } from "@/lib/sources/adapters";
import { now, observation, pulse } from "./helpers";
function adapters(failed?: Source): Record<Source, SourceAdapter> {
  const adapter = (source: Source): SourceAdapter => async () => {
    if (source === failed) throw new Error("upstream outage");
    return { signals: [0, 1].map((i) => ({ ...observation(`${source}-${i}`, 0.5 + i * 0.5, source), text: `Bengaluru metro ${source} discussion ${i}`, title: `Bengaluru metro ${source} discussion ${i}` })),
      health: { source, status: "ok" as const, fetched: 2, accepted: 2, rejected: 0, durationMs: 10, checkedAt: now.toISOString() } };
  };
  return { gdelt: adapter("gdelt"), bluesky: adapter("bluesky"), hackernews: adapter("hackernews") };
}
describe("transactional pipeline", () => {
  it("persists irrelevant and unmatched items without letting them enter the score", async () => {
    const repo = repository();
    const supplied = adapters();
    supplied.gdelt = async () => ({ signals: [
      { ...observation("irrelevant", 1, "gdelt"), text: "Delhi weather discussion" },
      { ...observation("unmatched", 1, "gdelt"), title: "Bengaluru", text: "Bengaluru obscure miscellaneous discussion" },
      observation("ai-irrelevant", 1, "gdelt"),
    ], health: { source: "gdelt", status: "ok", fetched: 4, accepted: 3, rejected: 1, durationMs: 0, checkedAt: now.toISOString() } });
    const result = await ingest({ repository: repo, now, adapters: supplied, timeoutMs: 1000,
      ai: async () => new Map([[observation("ai-irrelevant", 1, "gdelt").id, null]]) });
    expect(result.added).toBe(7);
    const data = await repo.load(now);
    expect(data.items.filter((i) => i.enrichmentStatus === "irrelevant")).toHaveLength(2);
    expect(data.items.filter((i) => i.enrichmentStatus === "pending")).toHaveLength(1);
    expect(data.observations).toHaveLength(4);
    expect(result.pulse?.totalSignals).toBe(4);
    expect((await repo.ingestionStatus({ source: "gdelt" }))[0]).toMatchObject({ discovered: 4, inserted: 3, errors: 1, duplicates: 0, status: "partial", errorMessage: "VALIDATION_REJECTED" });
  });
  it("marks started runs failed if publication fails and releases the lease", async () => {
    const repo = repository();
    const publish = vi.spyOn(repo, "publish").mockRejectedValue(new Error("Simulated storage failure"));
    await expect(ingest({ repository: repo, now, adapters: adapters(), timeoutMs: 1000, ai: async () => new Map() })).rejects.toThrow("storage failure");
    expect((await repo.ingestionStatus()).every((r) => r.status === "failed" && r.inserted === 0 && r.errors === 1 && r.errorMessage === "PUBLICATION_FAILED")).toBe(true);
    expect((await repo.load(now)).items).toHaveLength(0);
    expect(await repo.latest()).toBeNull();
    expect(await repo.acquireLease(now)).not.toBeNull();
    publish.mockRestore();
  });
  it("persists a snapshot and repeated polls are idempotent", async () => {
    const repo = repository();
    const first = await ingest({ repository: repo, now, adapters: adapters(), timeoutMs: 1000, ai: async () => new Map() });
    const second = await ingest({ repository: repo, now, adapters: adapters(), timeoutMs: 1000, ai: async () => new Map() });
    expect(first.added).toBe(6); expect(second.added).toBe(0);
    expect(second.pulse?.trends[0]?.currentCount).toBe(6);
    expect((await repo.load(now)).observations).toHaveLength(6);
    expect((await repo.latest())?.status).toBe("healthy");
    const runs = await repo.ingestionStatus();
    expect(runs).toHaveLength(6);
    expect(runs.slice(0, 3).every((r) => r.inserted === 0 && r.duplicates === 2 && r.status === "completed")).toBe(true);
    expect(runs.slice(3).every((r) => r.inserted === 2 && r.duplicates === 0)).toBe(true);
  });
  it("isolates a failed source and falls back after AI failure", async () => {
    const repo = repository();
    const result = await ingest({ repository: repo, now, adapters: adapters("gdelt"), timeoutMs: 1000, ai: async () => { throw new Error("model unavailable"); } });
    expect(result.pulse?.status).toBe("degraded"); expect(result.added).toBe(4);
    expect(result.pulse?.trends[0]?.sources).toEqual(["bluesky", "hackernews"]);
    expect(result.pulse?.trends[0]?.diversity).toBeCloseTo(2 / 3);
    expect((await repo.ingestionStatus({ source: "gdelt" }))[0]).toMatchObject({ status: "failed", errors: 1, inserted: 0, errorMessage: "SOURCE_UNAVAILABLE" });
  });
  it("excludes overlapping ingestion and protects the lease owner", async () => {
    const repo = repository(); await repo.initialize();
    const owner = await repo.acquireLease(now);
    expect(owner).not.toBeNull(); expect(await repo.acquireLease(now)).toBeNull();
    await repo.releaseLease("different-owner"); expect(await repo.acquireLease(now)).toBeNull();
    const result = await ingest({ repository: repo, now, adapters: adapters(), timeoutMs: 1000 });
    expect(result.skipped).toBe(true);
    await repo.releaseLease(owner!); expect(await repo.acquireLease(now)).not.toBeNull();
  });
  it("rejects a stale or unauthorized writer without publishing any snapshot", async () => {
    const repo = repository(); await repo.initialize();
    await expect(repo.publish([], [], pulse(), "wrong", now)).rejects.toThrow();
    expect(await repo.latest()).toBeNull();
    const owner = await repo.acquireLease(now);
    await expect(repo.publish([], [], pulse(), owner!, new Date(now.getTime() + 120001))).rejects.toThrow();
    expect(await repo.latest()).toBeNull();
  });
});
