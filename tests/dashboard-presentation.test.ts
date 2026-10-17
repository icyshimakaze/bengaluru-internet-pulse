import { describe, expect, it } from "vitest";
import { demoReadState, projectDashboard } from "@/lib/server/projections";
import { elapsedLabel, emptyDashboardState, isLive, LIVE_FRESHNESS_MS } from "@/lib/trends/dashboard-presentation";
import { readQuerySchema } from "@/lib/domain/read-models";
import { FIXTURE_NOW } from "@/fixtures/demo";
const now = FIXTURE_NOW.getTime();
const demo = projectDashboard(demoReadState(FIXTURE_NOW), { window: "2h" }, FIXTURE_NOW);
const live = { ...demo, mode: "live" as const, status: "healthy" as const, lastSuccessfulIngestion: FIXTURE_NOW.toISOString() };
describe("truthful dashboard status", () => {
  it("never describes missing or stale collection as a quiet city, even with filters", () => {
    for (const pulse of [
      { ...live, generatedAt: null }, { ...live, stale: true },
      { ...live, status: "unavailable" as const }, { ...live, availableSources: [] },
      { ...live, snapshot: { ...live.snapshot, refreshDelayed: true } },
    ]) {
      for (const filtered of [false, true]) expect(emptyDashboardState(pulse, filtered).eyebrow).toBe("COLLECTION DELAYED");
    }
  });
  it("distinguishes limited coverage, healthy low activity and an empty selection", () => {
    expect(emptyDashboardState({ ...live, status: "degraded" }, false).eyebrow).toBe("LIMITED COVERAGE");
    expect(emptyDashboardState(live, false).eyebrow).toBe("A QUIET WINDOW");
    expect(emptyDashboardState(demo, true).title).toBe("No matching conversations");
  });
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
  it("replaces live heuristic keyword display labels with literal evidence without changing rank identity or scores", () => {
    const state = demoReadState(FIXTURE_NOW);
    const original = projectDashboard(state, { window: "2h" }, FIXTURE_NOW);
    const changed = { ...state, mode: "live" as const, topics: state.topics.map((topic) => ({ ...topic, canonicalLabel: topic.canonicalLabel.toLowerCase(), enrichmentMethod: "rules" as const })) };
    const displayed = projectDashboard(changed, { window: "2h" }, FIXTURE_NOW);
    expect(displayed.topTopics.map(({ slug, score, activityCount }) => ({ slug, score, activityCount })))
      .toEqual(original.topTopics.map(({ slug, score, activityCount }) => ({ slug, score, activityCount })));
    expect(displayed.topTopics[0]!.title).not.toBe(changed.topics.find((topic) => topic.slug === displayed.topTopics[0]!.slug)!.canonicalLabel);
    expect(displayed.topTopics.every((topic) => topic.title.length <= 100)).toBe(true);
  });
  it("makes a deduplicated singleton discoverable without promoting it into momentum, and honors filters", () => {
    const state = demoReadState(FIXTURE_NOW);
    const food = state.topics.find((topic) => topic.slug === "food-and-cafes")!;
    const item = state.items.find((item) => item.topicId === food.id)!;
    const changed = { ...state, items: state.items.filter((row) => row.topicId !== food.id).concat([
      item, { ...item, id: "duplicate-early-mention" },
      { ...item, id: "pending-early-mention", enrichmentStatus: "pending" as const },
      { ...item, id: "future-early-mention", publishedAt: new Date(now + 60000).toISOString() },
    ]) };
    const result = projectDashboard(changed, { window: "2h" }, FIXTURE_NOW);
    expect(result.topTopics.some((topic) => topic.slug === food.slug)).toBe(false);
    expect(result.recentConversations).toContainEqual(expect.objectContaining({ slug: food.slug, signalCount: 1, sources: [item.source] }));
    expect(result.recentConversations.every((topic) => !result.topTopics.some((ranked) => ranked.slug === topic.slug))).toBe(true);
    expect(projectDashboard(changed, { window: "2h", category: "traffic" }, FIXTURE_NOW).recentConversations.some((topic) => topic.slug === food.slug)).toBe(false);
    const otherSource = item.source === "gdelt" ? "bluesky" : "gdelt";
    expect(projectDashboard(changed, { window: "2h", source: otherSource }, FIXTURE_NOW).recentConversations.some((topic) => topic.slug === food.slug)).toBe(false);
    expect(projectDashboard({ ...changed, snapshot: null }, { window: "2h" }, FIXTURE_NOW).recentConversations).toEqual([]);
    expect(projectDashboard(changed, { window: "2h" }, new Date(now + 48 * 3600000)).recentConversations).toEqual([]);
  });
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
