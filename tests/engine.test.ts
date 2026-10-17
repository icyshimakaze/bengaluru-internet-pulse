import { describe, expect, it } from "vitest";
import { computeTrends, evaluateTopics, deduplicateEvidence, computeHotspots, formatChange, HOUR } from "@/lib/trends/engine";
import { trendSchema, sources, type Topic, type Observation } from "@/lib/domain/schema";
import { now, observation, topic } from "./helpers";
import { demoDataset } from "@/fixtures/demo";

function signals(c: number, p: number, slug = topic.slug, cross = true, currentAge = 0.15): Observation[] {
  return [
    ...Array.from({ length: c }, (_, i) => observation(`${slug}-current-${i}`, currentAge + i / Math.max(1, c) * 0.6, cross ? sources[i % 3]! : "bluesky", slug)),
    ...Array.from({ length: p }, (_, i) => observation(`${slug}-previous-${i}`, 2.5 + i / Math.max(1, p), cross ? sources[i % 3]! : "bluesky", slug)),
  ];
}
const metric = (input: Observation[], descriptor: Topic = topic) => evaluateTopics([descriptor], input, now)[0]!;

describe("production deterministic momentum v3", () => {
  it("ranks a rapidly rising genuine small topic above a large stable topic", () => {
    const burst = { ...topic, slug: "burst" }, stable = { ...topic, slug: "stable" };
    const trends = computeTrends([stable, burst], [...signals(100, 100, stable.slug), ...signals(8, 1, burst.slug)], now);
    expect(trends.map((t) => t.slug)).toEqual(["burst", "stable"]);
    expect(trends[0]!.score).toBeGreaterThan(trends[1]!.score);
    expect(trends[1]!.velocity).toBe(0); expect(trends[1]!.lifecycle).toBe("STABLE");
    expect(trends[1]!.score).toBeLessThanOrEqual(60);
  });
  it("uses exactly the requested four weights with confidence outside the equation", () => {
    const m = metric(signals(8, 1));
    expect(m.scoreCap).toBe(100);
    expect(m.score).toBe(Math.round(100 * (0.4 * m.velocity + 0.25 * m.volume + 0.2 * m.diversity + 0.15 * m.recency)));
    expect(m.growthRatio).toBe(9 / 2);
    expect(m.velocity).toBeCloseTo(8 / 11);
    expect(m.volume).toBeCloseTo(Math.log(9) / Math.log(21));
    expect(m.latestSignalAgeHours).toBeCloseTo(0.15);
  });
  it("uses exact two-hour, six-hour and day boundaries and excludes future/expired signals", () => {
    const m = metric([observation("now", 0), observation("near", 1.99), observation("two", 2), observation("four", 4),
      observation("six", 6), observation("day", 24), observation("future", -0.1), observation("expired", 24.01)]);
    expect(m).toMatchObject({ current2h: 2, previous2h: 1, count6h: 4, count24h: 6, sourceCount: 1, growthRatio: 1.5, growthPercent: 33 });
    expect(m.history.reduce((sum, h) => sum + h.count, 0)).toBe(6);
    expect(m.firstSeenAt).toBe(observation("expired", 24.01).publishedAt);
  });
  it("keeps one isolated signal NEW, low confidence, capped, and outside the ranked list", () => {
    const input = [observation("one", 0.1)], m = metric(input);
    expect(m.lifecycle).toBe("NEW"); expect(m.score).toBeLessThanOrEqual(20); expect(m.confidence).toBeLessThanOrEqual(0.25);
    expect(computeTrends([topic], input, now)).toEqual([]);
  });
  it("caps low-volume single-source evidence and a thousand-signal single-provider spam cluster", () => {
    const small = metric(signals(3, 1, topic.slug, false)), spam = metric(signals(1000, 1, topic.slug, false));
    expect(small.score).toBeLessThanOrEqual(35); expect(spam.score).toBeLessThanOrEqual(55);
    expect(spam.lifecycle).not.toBe("HOT"); expect(spam.confidence).toBeLessThanOrEqual(0.45);
    expect(spam.volume).toBe(1);
  });
  it("deduplicates repeated polls and syndicated cross-source copies without inflating age, confidence or sources", () => {
    const a = observation("original-a", 0.5, "gdelt"), b = observation("original-b", 0.75, "bluesky");
    const copies = Array.from({ length: 50 }, (_, i) => ({ ...a, id: "copy-" + i, sourceId: "copy-" + i, source: "hackernews" as const,
      domain: "syndicated.example", canonicalUrl: `https://syndicated.example/${i}`, contentHash: "different-fingerprint-" + i,
      publishedAt: new Date(now.getTime() - 0.01 * HOUR).toISOString() }));
    const clean = metric([a, b]), heavy = metric([a, b, ...copies, ...copies]);
    expect(heavy).toEqual(clean); expect(heavy.current2h).toBe(2); expect(heavy.sourceCount).toBe(2);
  });
  it("collapses transitive duplicate identity bridges before any scoring", () => {
    const a = observation("bridge-a", 1), b = { ...observation("bridge-b", 0.5), canonicalUrl: a.canonicalUrl },
      c = { ...observation("bridge-c", 0.1), contentHash: b.contentHash };
    expect(deduplicateEvidence([c, b, a], now)).toEqual([a]);
    expect(metric([a, b, c]).current2h).toBe(1); expect(computeTrends([topic], [a, b, c], now)).toEqual([]);
  });
  it("does not turn syndicated near-copies into independent provider corroboration", () => {
    const title = "Bengaluru metro transports donated organ from hospital to hospital for emergency surgery";
    const a = { ...observation("syndication-first", 0.5, "gdelt"), title, text: title, excerpt: title };
    const b = { ...observation("syndication-copy", 0.1, "bluesky"), title: title + " today", text: title + " today", excerpt: title + " today" };
    const m = metric([a, b]);
    expect(m.current2h).toBe(1); expect(m.sourceCount).toBe(1); expect(m.score).toBeLessThanOrEqual(20);
    expect(m.latestAt).toBe(a.publishedAt);
  });
  it("does not award perfect velocity to a new topic with no baseline", () => {
    const fresh = metric(signals(2, 0, topic.slug, true, 0.05));
    const huge = metric(signals(100, 0));
    expect(fresh.growthRatio).toBe(3); expect(fresh.velocity).toBeLessThan(1); expect(fresh.lifecycle).toBe("NEW");
    expect(huge.velocity).toBeLessThanOrEqual(0.65);
    expect(formatChange(fresh)).toBe("No baseline");
  });
  it("recognizes a cooling topic without negative or invalid components", () => {
    const m = metric(signals(3, 20));
    expect(m.lifecycle).toBe("COOLING"); expect(m.velocity).toBe(0); expect(m.growthPercent).toBe(-85);
    expect(m.growthRatio).toBeCloseTo(4 / 21);
  });
  it("rewards genuine independent cross-source evidence without changing the denominator", () => {
    const one = metric(signals(8, 1, topic.slug, false)), cross = metric(signals(8, 1));
    expect(one.diversity).toBeCloseTo(1 / 3); expect(cross.diversity).toBe(1);
    expect(cross.score).toBeGreaterThan(one.score); expect(cross.confidence).toBeGreaterThan(one.confidence);
    expect(cross.lifecycle).toBe("HOT");
  });
  it("penalizes a dominant provider even when token contributions fake source diversity", () => {
    const input = signals(100, 1, topic.slug, false);
    input[0] = { ...input[0]!, source: "gdelt" };
    const m = metric(input);
    expect(m.sourceCount).toBe(2); expect(m.score).toBeLessThanOrEqual(55); expect(m.sourceBalance).toBeLessThan(0.6);
    expect(m.lifecycle).not.toBe("HOT");
  });
  it("provides finite zero metrics for no data, empty topics, and an unknown first-seen time", () => {
    expect(computeTrends([], [], now)).toEqual([]); expect(computeTrends([topic], [], now)).toEqual([]);
    const m = metric([]);
    expect(m).toMatchObject({ current2h: 0, previous2h: 0, count6h: 0, count24h: 0, sourceCount: 0, growthRatio: 1,
      latestAt: null, latestSignalAgeHours: null, firstSeenAt: null, score: 0, confidence: 0, lifecycle: "STABLE" });
    expect(trendSchema.safeParse(m).success).toBe(true);
  });
  it("bounds tiny previous denominators and labels capped percentages honestly", () => {
    const m = metric(signals(1000, 1));
    expect(m.growthRatio).toBe(1001 / 2); expect(m.growthPercent).toBe(300); expect(m.changeCapped).toBe(true);
    expect(formatChange(m)).toBe("≥300%");
    expect(metric(signals(2, 1)).growthPercent).toBe(33);
  });
  it("ages out stale topics and preserves older persisted first-seen metadata", () => {
    const data = [observation("old-a", 10), observation("old-b", 11)], first = new Date(now.getTime() - 30 * 24 * HOUR).toISOString();
    const m = metric(data, { ...topic, firstSeenAt: first });
    expect(m.firstSeenAt).toBe(first); expect(m.latestSignalAgeHours).toBe(10); expect(m.score).toBe(0); expect(m.lifecycle).toBe("COOLING");
    expect(metric([], { ...topic, firstSeenAt: first })).toMatchObject({ lifecycle: "COOLING", score: 0, confidence: 0, firstSeenAt: first });
    expect(computeTrends([topic], data, now)).toEqual([]);
  });
  it("measures cluster consistency deterministically and lowers confidence for incoherent clusters", () => {
    const clean = signals(6, 1), words = ["avocado parsley", "galaxy telescope", "violin orchestra", "football striker", "pottery ceramics", "volcano geology"];
    const inconsistent = clean.map((o, i) => i < 6 ? { ...o, title: words[i]!, excerpt: words[i]!, text: words[i]! } : o);
    const a = metric(clean), b = metric(inconsistent);
    expect(a.clusterConsistency).toBe(1); expect(b.clusterConsistency).toBe(0);
    expect(b.confidence).toBeLessThan(a.confidence); expect(b.score).toBeLessThanOrEqual(60); expect(b.lifecycle).not.toBe("HOT");
  });
  it.each([
    [2, 0, 0.05, "NEW"], [4, 0, 0.75, "EMERGING"], [6, 3, 0.15, "RISING"],
    [8, 1, 0.15, "HOT"], [20, 20, 0.15, "STABLE"], [3, 8, 0.15, "COOLING"],
  ] as const)("classifies %i current / %i previous signals as %s using deterministic thresholds", (c, p, age, lifecycle) => {
    expect(metric(signals(c, p, topic.slug, true, age)).lifecycle).toBe(lifecycle);
  });
  it("requires recent evidence for HOT even when counts and sources are large", () => {
    const m = metric(signals(100, 1, topic.slug, true, 1.2));
    expect(m.latestSignalAgeHours).toBeGreaterThan(0.5); expect(m.lifecycle).not.toBe("HOT");
  });
  it("keeps every factor bounded and order-independent without mutating inputs", () => {
    const data = demoDataset(now), before = structuredClone(data);
    const a = computeTrends(data.topics, data.observations, now), b = computeTrends([...data.topics].reverse(), [...data.observations].reverse(), now);
    expect(a).toEqual(b); expect(data).toEqual(before);
    for (const t of a) for (const key of ["velocity", "volume", "diversity", "recency", "confidence", "clusterConsistency", "sourceBalance"] as const) {
      expect(t[key]).toBeGreaterThanOrEqual(0); expect(t[key]).toBeLessThanOrEqual(1);
    }
    expect(() => evaluateTopics([topic], [], new Date("invalid"))).toThrow("scoring clock");
  });
  it("resolves tied scores by canonical slug", () => {
    const second = { ...topic, slug: "another-topic" };
    const data = [observation("a", 0.5), observation("b", 1), observation("c", 0.5, "bluesky", second.slug), observation("d", 1, "bluesky", second.slug)];
    expect(computeTrends([topic, second], data, now).map((t) => t.slug)).toEqual(["another-topic", "test-topic"]);
  });
  it("only maps deduplicated explicitly located current two-hour evidence", () => {
    const input = [observation("a", 0.5), observation("b", 1), observation("boundary", 2), observation("old", 4)].map((o) => ({ ...o, neighborhood: "Whitefield" as const }));
    const trends = computeTrends([topic], input, now);
    expect(computeHotspots([...trends, ...trends], now)).toEqual([{ neighborhood: "Whitefield", lat: 12.9696365, lng: 77.7497448, count: 2, topics: [topic.slug] }]);
  });
});
