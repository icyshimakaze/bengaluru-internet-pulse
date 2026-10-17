import { describe, expect, it } from "vitest";
import { evidenceExplanation, evidenceLinks, supportedLocation, observedMilestones, evidenceHeadline } from "@/lib/trends/topic-presentation";
import { locationEvidenceSchema, type HistorySnapshot, type PublicSignal } from "@/lib/domain/read-models";
import { demoReadState, projectTopic } from "@/lib/server/projections";
import { FIXTURE_NOW } from "@/fixtures/demo";
const signal = (neighborhood: PublicSignal["neighborhood"], source: PublicSignal["source"] = "gdelt") => ({ neighborhood, source });
const snapshot = (score: number, lifecycle: HistorySnapshot["lifecycle"], hour: number, version: "v1" | "v2" = "v2"): HistorySnapshot => ({
  capturedAt: new Date(FIXTURE_NOW.getTime() - hour * 3_600_000).toISOString(), algorithmVersion: version,
  pulseScore: score, lifecycle, count2h: 5, previousCount2h: 2, count6h: 7, count24h: 9, sourceCount: 2,
  confidence: 0.7, velocityScore: 0.5, volumeScore: 0.5, diversityScore: 2 / 3, recencyScore: 0.9,
});
describe("evidence-grounded topic explanations", () => {
  it("preserves the source's readable wording while removing URL and attribution noise", () => {
    expect(evidenceHeadline("5th T20I: Play stopped as rain returns in Bengaluru. #INDvsWI https://example.org/story Source: @reporter Original Post: https://example.org/post"))
      .toBe("5th T20I: Play stopped as rain returns in Bengaluru.");
    expect(evidenceHeadline("ಬೆಂಗಳೂರು ಮಳೆಯ ವರದಿ #Bengaluru")).toBe("ಬೆಂಗಳೂರು ಮಳೆಯ ವರದಿ Bengaluru");
    expect(evidenceHeadline("5வது டி20 போட்டி - இந்திய #அணி முதலில் பேட்டிங்..! #Bengaluru | #INDvsWI | #Polimernews"))
      .toBe("5வது டி20 போட்டி - இந்திய அணி முதலில் பேட்டிங்..!");
    expect(evidenceHeadline("A Bengaluru community announcement | | ")).toBe("A Bengaluru community announcement");
    expect(evidenceHeadline("https://example.org/#news")).toBeNull();
    const long = "A public source headline with Bengaluru context and enough complete words to require careful truncation while preserving its original facts";
    const displayed = evidenceHeadline(long)!;
    expect(displayed.length).toBeLessThanOrEqual(100); expect(displayed).toMatch(/…$/u);
    expect(long.startsWith(displayed.slice(0, -1))).toBe(true);
  });
  it("describes rising counts and provider coverage without attributing causes", () => {
    expect(evidenceExplanation({ current2h: 14, previous2h: 3, sourceCount: 3 })).toBe("Distinct mentions increased from 3 to 14 between successive two-hour windows, spanning 3 public source providers.");
  });
  it("does not call cooling, stable, sparse or absent activity a surge", () => {
    expect(evidenceExplanation({ current2h: 4, previous2h: 12, sourceCount: 1 })).toContain("cooling rather than accelerating");
    expect(evidenceExplanation({ current2h: 4, previous2h: 4, sourceCount: 2 })).toContain("Volume is steady");
    expect(evidenceExplanation({ current2h: 1, previous2h: 0, sourceCount: 1 })).toContain("without an established baseline");
    expect(evidenceExplanation({ current2h: 1, previous2h: 0, sourceCount: 1 })).toContain("1 distinct signal was observed");
    expect(evidenceExplanation({ current2h: 0, previous2h: 5, sourceCount: 0 })).toContain("No distinct signals");
  });
});
it("serializes only displayed evidence provenance to browser components", () => {
  const signal = projectTopic(demoReadState(FIXTURE_NOW, "namma-metro"), "namma-metro", FIXTURE_NOW)!.sourceEvidence[0]!;
  const links = evidenceLinks([{ ...signal, excerpt: "UNNECESSARY_CONTENT" }]);
  expect(links[0]).toEqual({ id: signal.id, source: signal.source, sourceType: signal.sourceType,
    url: signal.url, title: signal.title, domain: signal.domain, publishedAt: signal.publishedAt, timeKind: signal.timeKind });
  expect(JSON.stringify(links)).not.toContain("UNNECESSARY_CONTENT");
});
describe("supported neighborhoods", () => {
  it("requires explicit evidence from multiple providers", () => {
    expect(supportedLocation([signal("Whitefield"), signal("Whitefield", "bluesky"), signal(null)])).toMatchObject({
      status: "supported", neighborhood: "Whitefield", mentionCount: 2, locatedSignalCount: 2, sourceCount: 2,
    });
    expect(supportedLocation([signal("Whitefield")])).toMatchObject({ status: "insufficient", neighborhood: null });
    expect(supportedLocation([signal("Whitefield"), signal("Whitefield")])).toMatchObject({ status: "insufficient", neighborhood: null });
  });
  it("does not guess from contradictory or missing locations", () => {
    expect(supportedLocation([signal("Whitefield"), signal("Hebbal", "bluesky")])).toMatchObject({ status: "mixed", neighborhood: null });
    expect(supportedLocation([signal(null), signal(null, "bluesky")])).toMatchObject({ status: "unknown", neighborhood: null });
  });
  it("accepts a consistent majority while retaining the evidence denominator", () => {
    const result = supportedLocation([signal("Whitefield"), signal("Whitefield", "bluesky"), signal("Whitefield", "hackernews"), signal("Hebbal"), signal("Indiranagar")]);
    expect(result).toMatchObject({ status: "supported", mentionCount: 3, locatedSignalCount: 5, sourceCount: 3 });
    expect(locationEvidenceSchema.safeParse({ ...result, sourceCount: 1 }).success).toBe(false);
    expect(locationEvidenceSchema.safeParse({ ...result, neighborhood: null }).success).toBe(false);
  });
  it("derives location from full deduplicated evidence, before the 30-item display limit", () => {
    const state = demoReadState(FIXTURE_NOW, "namma-metro"), detail = projectTopic(state, "namma-metro", FIXTURE_NOW)!;
    expect(detail.sourceEvidence).toHaveLength(30);
    expect(detail.locationEvidence).toMatchObject({ neighborhood: "Whitefield", status: "supported", sourceCount: 3 });
    expect(detail.locationEvidence.mentionCount).toBeGreaterThan(detail.sourceEvidence.filter((s) => s.neighborhood === "Whitefield").length);
    const topicId = state.topics.find((t) => t.slug === "namma-metro")!.id;
    const unknown = projectTopic({ ...state, items: state.items.map((i) => i.topicId === topicId ? { ...i, neighborhood: null } : i) }, "namma-metro", FIXTURE_NOW)!;
    expect(unknown.locationEvidence).toMatchObject({ neighborhood: null, status: "unknown" });
  });
});
describe("recorded lifecycle milestones", () => {
  it("keeps missing stages missing and never compares archival equations", () => {
    const record = snapshot(60, "HOT", 1);
    expect(observedMilestones([snapshot(100, "RISING", 5, "v1"), record])).toEqual({ emerging: null, rising: null, peak: record });
    expect(observedMilestones([])).toEqual({ emerging: null, rising: null, peak: null });
  });
  it("finds first observed stages and the earliest retained maximum without mutating history", () => {
    const emerging = snapshot(45, "EMERGING", 4), rising = snapshot(65, "RISING", 3), peak = snapshot(90, "HOT", 2);
    const rows = [snapshot(90, "HOT", 1), peak, rising, emerging];
    const copy = [...rows];
    expect(observedMilestones(rows)).toEqual({ emerging, rising, peak });
    expect(rows).toEqual(copy);
  });
  it("does not invent a peak from snapshots with no evidence", () => {
    expect(observedMilestones([{ ...snapshot(0, "COOLING", 0), count2h: 0, count6h: 0, count24h: 0 }]).peak).toBeNull();
  });
});
