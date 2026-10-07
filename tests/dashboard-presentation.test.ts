import { describe, expect, it } from "vitest";
import { demoReadState, projectDashboard } from "@/lib/server/projections";
import { elapsedLabel, isLive, LIVE_FRESHNESS_MS } from "@/lib/trends/dashboard-presentation";
import { readQuerySchema } from "@/lib/domain/read-models";
import { FIXTURE_NOW } from "@/fixtures/demo";
const now = FIXTURE_NOW.getTime();
const demo = projectDashboard(demoReadState(FIXTURE_NOW), { window: "2h" }, FIXTURE_NOW);
const live = { ...demo, mode: "live" as const, status: "healthy" as const, lastSuccessfulIngestion: FIXTURE_NOW.toISOString() };
describe("truthful dashboard status", () => {
  it("never labels demo fixtures LIVE", () => expect(isLive({ ...demo, lastSuccessfulIngestion: FIXTURE_NOW.toISOString() }, now)).toBe(false));
  it("requires a successful, fresh, non-future ingestion and a readable snapshot", () => {
    expect(isLive(live, now)).toBe(true);
    expect(isLive(live, now + LIVE_FRESHNESS_MS)).toBe(true);
    expect(isLive(live, now + LIVE_FRESHNESS_MS + 1)).toBe(false);
    expect(isLive(live, now - 1)).toBe(false);
    expect(isLive({ ...live, lastSuccessfulIngestion: null }, now)).toBe(false);
    expect(isLive({ ...live, stale: true }, now)).toBe(false);
    expect(isLive({ ...live, status: "unavailable" }, now)).toBe(false);
    expect(isLive({ ...live, snapshot: { ...live.snapshot, refreshDelayed: true } }, now)).toBe(false);
  });
  it("expires labels predictably without unstable client hydration clocks", () => {
    expect(elapsedLabel(null, now)).toBe("Awaiting ingestion");
    expect(elapsedLabel(live.lastSuccessfulIngestion, now)).toBe("Just now");
    expect(elapsedLabel(live.lastSuccessfulIngestion, now + 60_000)).toBe("1 min ago");
    expect(elapsedLabel(live.lastSuccessfulIngestion, now + 3_600_000)).toBe("1h ago");
    expect(elapsedLabel(live.lastSuccessfulIngestion, now + 86_400_000)).toBe("1d ago");
    expect(elapsedLabel(live.lastSuccessfulIngestion, now - 1)).toBe("Timestamp unavailable");
  });
});
describe("homepage taxonomy and fixture history", () => {
  it("filters canonical categories consistently across rankings, stream and hotspots", () => {
    const state = demoReadState(FIXTURE_NOW);
    const food = projectDashboard(state, readQuerySchema.parse({ category: "food", window: "6h" }), FIXTURE_NOW);
    expect(food.topTopics).toHaveLength(1);
    expect(food.topTopics[0]).toMatchObject({ semanticCategory: "food", neighborhood: "Indiranagar" });
    expect(food.sourceStream.every((s) => s.topicSlug === "food-and-cafes")).toBe(true);
    expect(food.hotspots.map((h) => h.neighborhood)).toEqual(["Indiranagar"]);
    for (const category of ["business", "culture", "sports"] as const) {
      const result = projectDashboard(state, { window: "24h", category }, FIXTURE_NOW);
      expect(result.topTopics).toEqual([]); expect(result.sourceStream).toEqual([]); expect(result.hotspots).toEqual([]);
    }
    expect(projectDashboard(state, { window: "2h", category: "City life" }, FIXTURE_NOW).topTopics).toHaveLength(2);
  });
  it("replays demo scoring using only evidence available at each snapshot", () => {
    const state = demoReadState(FIXTURE_NOW, "namma-metro");
    expect(state.history).toHaveLength(49);
    expect(state.history[0]!.count24h).toBe(0);
    expect(state.history.at(-1)!.pulseScore).toBe(demo.topTopics[0]!.score);
    expect(state.history.every((h) => h.capturedAt <= FIXTURE_NOW.toISOString() && h.pulseScore >= 0 && h.pulseScore <= 100)).toBe(true);
  });
});
