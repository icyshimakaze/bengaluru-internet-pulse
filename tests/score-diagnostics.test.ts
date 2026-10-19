import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScoreDiagnostics } from "@/components/score-diagnostics";
import { dashboardSchema } from "@/lib/domain/read-models";
import { demoReadState, projectDashboard, projectTopic } from "@/lib/server/projections";
import { now } from "./helpers";

function singleton() {
  const state = demoReadState(now);
  const item = [...state.items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .find((i) => i.topicId && i.enrichmentStatus === "completed")!;
  state.items = [item];
  const topic = state.topics.find((t) => t.id === item.topicId)!;
  return { state, topic, item };
}
describe("inspectable scores below the lead threshold", () => {
  it("shows the engine's capped singleton score without promoting it to a ranked lead", () => {
    const { state, topic } = singleton();
    const data = projectDashboard(state, { window: "now" }, now);
    const detail = projectTopic(state, topic.slug, now)!;
    expect(data.topTopics).toEqual([]);
    expect(data.diagnosticTopics).toHaveLength(1);
    expect(data.diagnosticTopics[0]).toMatchObject({ slug: topic.slug, score: detail.pulseScore, confidence: detail.confidence, current2h: 1 });
    expect(detail.pulseScore).toBeGreaterThan(0); expect(detail.pulseScore).toBeLessThanOrEqual(20);
    const html = renderToStaticMarkup(createElement(ScoreDiagnostics, { topics: data.diagnosticTopics, query: "" }));
    expect(html).toContain("Pulse Scores · early signals"); expect(html).toContain("below the lead threshold");
    expect(html).toContain("1 signal"); expect(html).toContain(`/topic/${topic.slug}`);
  });
  it("ages diagnostics to zero and explains it instead of reusing a captured nonzero score", () => {
    const { state } = singleton(), later = new Date(now.getTime() + 3 * 60 * 60_000);
    const data = projectDashboard(state, { window: "24h" }, later);
    expect(data.diagnosticTopics[0]).toMatchObject({ score: 0, current2h: 0 });
    const html = renderToStaticMarkup(createElement(ScoreDiagnostics, { topics: data.diagnosticTopics, query: "" }));
    expect(html).toContain("score has aged to zero");
  });
  it("honors category, source, activity-window and local search filters", () => {
    const { state, item } = singleton();
    const other = item.source === "gdelt" ? "bluesky" : "gdelt";
    expect(projectDashboard(state, { window: "now", source: other }, now).diagnosticTopics).toEqual([]);
    expect(projectDashboard(state, { window: "now", category: "jobs" }, now).diagnosticTopics).toEqual([]);
    const data = projectDashboard(state, { window: "now" }, now);
    expect(renderToStaticMarkup(createElement(ScoreDiagnostics, { topics: data.diagnosticTopics, query: "no-such-topic-123" }))).toBe("");
    expect(projectDashboard(state, { window: "2h" }, new Date(now.getTime() + 3 * 60 * 60_000)).diagnosticTopics).toEqual([]);
  });
  it("does not add diagnostic duplicates of qualified lead topics and accepts older API payloads", () => {
    const data = projectDashboard(demoReadState(now), { window: "now" }, now);
    const qualified = new Set(data.topTopics.filter((t) => t.current2h >= 2 && t.confidence >= 0.35 && t.score > 0).map((t) => t.slug));
    expect(data.diagnosticTopics.every((t) => !qualified.has(t.slug))).toBe(true);
    expect(data.diagnosticTopics.length).toBeLessThanOrEqual(4);
    const old = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "diagnosticTopics"));
    expect(dashboardSchema.parse(old).diagnosticTopics).toEqual([]);
  });
});
