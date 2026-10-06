import { describe, expect, it } from "vitest";
import { computeTrends, computeHotspots, HOUR } from "@/lib/trends/engine";
import { now, observation, topic } from "./helpers";
import { demoDataset } from "@/fixtures/demo";

describe("deterministic momentum", () => {
  it("ranks a burst above high but shrinking popularity", () => {
    const { topics, observations } = demoDataset(now);
    const trends = computeTrends(topics, observations, now);
    expect(trends[0]?.slug).toBe("namma-metro");
    expect(trends.find((t) => t.slug === "traffic-and-commutes")?.lifecycle).toBe("cooling");
    expect(trends[0]?.score).toBeGreaterThan(trends.find((t) => t.slug === "traffic-and-commutes")!.score);
  });
  it("uses exact current/baseline boundaries and excludes future evidence", () => {
    const trends = computeTrends([topic], [observation("now", 0), observation("near", 2.99), observation("three", 3), observation("six", 6), observation("future", -0.1), observation("day", 24)], now);
    expect(trends[0]?.currentCount).toBe(2);
    expect(trends[0]?.baselineCount).toBe(1);
    expect(trends[0]?.totalCount).toBe(5);
    expect(trends[0]?.growthPercent).toBe(33);
    expect(trends[0]?.history.reduce((sum, h) => sum + h.count, 0)).toBe(trends[0]?.totalCount);
  });
  it("does not rank one mention or an expired conversation", () => {
    expect(computeTrends([topic], [observation("one", 1)], now)).toEqual([]);
    expect(computeTrends([topic], [observation("one", 1), observation("two", 2)], new Date(now.getTime() + 4 * HOUR))).toEqual([]);
  });
  it("rewards cross-source evidence without shrinking the denominator", () => {
    const one = computeTrends([topic], [observation("a", 1), observation("b", 1)], now)[0]!;
    const two = computeTrends([topic], [observation("a", 1), observation("b", 1, "gdelt")], now)[0]!;
    expect(one.diversity).toBeCloseTo(1 / 3);
    expect(two.diversity).toBeCloseTo(2 / 3);
    expect(two.score).toBeGreaterThan(one.score);
    expect(two.confidence).toBeGreaterThan(one.confidence);
  });
  it("caps factors and yields stable results independent of input order", () => {
    const data = demoDataset(now);
    expect(computeTrends(data.topics, data.observations, now)).toEqual(computeTrends([...data.topics].reverse(), [...data.observations].reverse(), now));
    for (const t of computeTrends(data.topics, data.observations, now)) for (const key of ["velocity", "volume", "diversity", "recency", "confidence"] as const) {
      expect(t[key]).toBeGreaterThanOrEqual(0); expect(t[key]).toBeLessThanOrEqual(1);
    }
  });
  it("resolves tied scores by slug", () => {
    const second = { ...topic, slug: "another-topic" };
    const input = [observation("a", 1), observation("b", 2), observation("c", 1, "bluesky", second.slug), observation("d", 2, "bluesky", second.slug)];
    expect(computeTrends([topic, second], input, now).map((t) => t.slug)).toEqual(["another-topic", "test-topic"]);
  });
  it("only maps explicitly located current evidence", () => {
    const obs = [observation("a", 1), observation("b", 2), observation("c", 4)].map((o) => ({ ...o, neighborhood: "Whitefield" as const }));
    expect(computeHotspots(computeTrends([topic], obs, now), now)).toEqual([{ neighborhood: "Whitefield", lat: 12.9698, lng: 77.75, count: 2, topics: [topic.slug] }]);
  });
});
