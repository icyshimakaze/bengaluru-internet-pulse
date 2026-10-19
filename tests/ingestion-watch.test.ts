import { describe, expect, it, vi } from "vitest";
import { runIngestionWatch, watchConfiguration, watchPolicy } from "@/lib/ingestion/watch";

function clock() {
  let time = Date.parse("2026-10-19T00:00:00Z");
  const polls: number[] = [], events: Array<{ event: string; fields: Record<string, string | number> }> = [];
  return { polls, events, runtime: { now: () => time, sleep: async (ms: number) => { time += ms; },
    collect: vi.fn(async () => { polls.push(time); time += 40_000; }),
    isCurrent: vi.fn(async () => true), report: (event: string, fields: Record<string, string | number>) => { events.push({ event, fields }); } } };
}
describe("bounded production collection between delayed schedules", () => {
  it("collects repeatedly across a four-hour scheduler gap without crossing source freshness limits", async () => {
    const c = clock(); await runIngestionWatch(true, c.runtime);
    expect(c.polls.length).toBeGreaterThan(8);
    expect(c.polls.at(-1)! - c.polls[0]!).toBeGreaterThan(4 * 60 * 60_000);
    expect(c.polls.at(-1)! - c.polls[0]!).toBeLessThanOrEqual(watchPolicy.durationMs);
    for (let i = 1; i < c.polls.length; i++) {
      const gap = c.polls[i]! - c.polls[i - 1]!;
      expect(gap).toBe(watchPolicy.intervalMs + 40_000);
      expect(gap).toBeLessThan(45 * 60_000);
    }
    expect(c.events.at(-1)?.event).toBe("ingest.watch.completed");
  });
  it("hands off within a minute of a new release, only after the active publication finishes", async () => {
    const c = clock(); c.runtime.isCurrent.mockResolvedValueOnce(true).mockResolvedValue(false);
    await runIngestionWatch(true, c.runtime);
    expect(c.polls).toHaveLength(1);
    expect(c.runtime.now() - c.polls[0]!).toBe(40_000 + watchPolicy.checkMs);
    expect(c.events.at(-1)?.event).toBe("ingest.watch.superseded");
  });
  it("does not start a stale queued revision", async () => {
    const c = clock(); c.runtime.isCurrent.mockResolvedValue(false);
    await runIngestionWatch(true, c.runtime); expect(c.polls).toEqual([]);
  });
  it("keeps one-shot operation short and independent of GitHub", async () => {
    const c = clock(); await runIngestionWatch(false, c.runtime);
    expect(c.polls).toHaveLength(1); expect(c.runtime.isCurrent).not.toHaveBeenCalled();
  });
  it("fails visibly on a storage/process failure without starting overlapping retries", async () => {
    const c = clock(); c.runtime.collect.mockRejectedValue(new Error("synthetic failure"));
    await expect(runIngestionWatch(true, c.runtime)).rejects.toThrow("synthetic failure");
    expect(c.runtime.collect).toHaveBeenCalledTimes(1); expect(c.events).toEqual([]);
  });
  it("does not catch up missed intervals in a burst or extend the wall-clock budget", async () => {
    const c = clock(); c.runtime.collect.mockImplementation(async () => {
      c.polls.push(c.runtime.now()); await c.runtime.sleep(2 * 60 * 60_000);
    });
    await runIngestionWatch(true, c.runtime);
    expect(c.polls).toHaveLength(2);
    expect(c.polls[1]! - c.polls[0]!).toBe(2 * 60 * 60_000 + watchPolicy.intervalMs);
  });
  it("defaults to a single remote run and requires public Actions context for extended polling", () => {
    expect(watchConfiguration({})).toEqual({ continuous: false });
    expect(watchConfiguration({ INGEST_CONTINUOUS: "false", REPOSITORY_VISIBILITY: "private" })).toEqual({ continuous: false });
    const env = { INGEST_CONTINUOUS: "true", GITHUB_ACTIONS: "true", REPOSITORY_VISIBILITY: "public",
      GITHUB_REPOSITORY: "example/public-project", GITHUB_SHA: "a".repeat(40), GITHUB_TOKEN: "synthetic-token" };
    expect(watchConfiguration(env).continuous).toBe(true);
    for (const override of [{ REPOSITORY_VISIBILITY: "private" }, { GITHUB_ACTIONS: "false" }, { GITHUB_TOKEN: "" },
      { INGEST_CONTINUOUS: "unknown" }, { GITHUB_REPOSITORY: "https://other.example/steal" }, { GITHUB_SHA: "not-a-sha" }]) {
      expect(() => watchConfiguration({ ...env, ...override })).toThrow();
    }
    expect(watchPolicy.collectionTimeoutMs).toBe(180_000);
  });
});
