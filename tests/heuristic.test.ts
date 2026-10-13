import { describe, expect, it } from "vitest";
import { HeuristicEnrichmentProvider, normalizeText, extractKeywords, tokenOverlap, topicSimilarity, classifyCategory, detectBengaluru } from "@/lib/enrichment/heuristic";
import { enrichmentBatchSchema, type EnrichmentTopic } from "@/lib/domain/enrichment";
import { observation } from "./helpers";
const signal = (title: string, id = "a") => ({ ...observation(id, 1), title, excerpt: title, text: title });
const context = { signal: new AbortController().signal };
const provider = new HeuristicEnrichmentProvider();

describe("genuine deterministic fallback normalization", () => {
  it("normalizes Unicode and spacing, removes stop words and preserves meaningful event tokens", () => {
    expect(normalizeText("  ＭＥＴＲＯ   Bengaluru  ")).toBe("metro bengaluru");
    expect(extractKeywords("The Bengaluru metro trains are delayed in Whitefield")).toEqual(["metro", "train", "delay", "whitefield"]);
    expect(tokenOverlap([], [])).toBe(0); expect(tokenOverlap(["metro", "delay"], ["metro", "delay"])).toBe(1);
  });
  it.each(["Bengaluru rain", "Bangalore food", "BMRCL extension", "BBMP waste", "ಬೆಂಗಳೂರು", "Whitefield traffic"])("detects supplied Bengaluru entity %s", (text) => {
    expect(detectBengaluru(text)).toBe(true);
  });
  it("marks unrelated source data irrelevant without inventing local relevance", async () => {
    const [result] = await provider.enrich([signal("Delhi weather rain")], [], context);
    expect(result).toMatchObject({ local_relevance: 0, neighborhood: "Unknown", confidence: 0.9 });
  });
  it.each([
    ["Bengaluru BBMP waste", "civic"], ["Bengaluru metro delay", "traffic"], ["Bengaluru software launch", "technology"],
    ["Bengaluru venture funding", "business"], ["Bengaluru museum exhibition", "culture"], ["Bengaluru dosa cafe", "food"],
    ["Bengaluru concert", "events"], ["Bengaluru rainfall", "weather"], ["Bengaluru cricket", "sports"], ["Bengaluru book review", "other"],
  ])("classifies %s as %s", (text, category) => { expect(classifyCategory(text)).toBe(category); });
  it("matches equivalent active topics but separates different event types, dates and neighborhoods", async () => {
    const catalog: EnrichmentTopic[] = [{ id: "delay", slug: "metro-delays-whitefield", canonical_label: "Metro delays Whitefield", category: "traffic" }];
    const [match, unrelated] = await provider.enrich([signal("Bangalore metro delayed in Whitefield"), signal("Bengaluru metro extension Whitefield", "b")], catalog, context);
    expect(match?.existing_topic_id).toBe("delay"); expect(unrelated?.existing_topic_id).toBeNull();
    expect(topicSimilarity("Bengaluru metro delay 14 October", "Metro delay 15 October")).toBe(0);
    expect(topicSimilarity("Metro delay Whitefield", "Metro delay Hebbal")).toBe(0);
  });
  it("creates actual signal-derived topics instead of grouping every metro or food story together", async () => {
    const items = await provider.enrich([signal("Bengaluru metro closure Whitefield"), signal("Bengaluru metro extension Hebbal", "b")], [], context);
    expect(items[0]?.slug).not.toBe(items[1]?.slug);
    expect(items[0]?.canonical_label).toContain("closure"); expect(items[1]?.canonical_label).toContain("extension");
  });
  it("avoids slug collisions when long titles share a truncated label but differ in event anchors", async () => {
    const prefix = "Bengaluru metro community passenger transport network station service update discussion";
    const items = await provider.enrich([signal(`${prefix} closure 14 October`), signal(`${prefix} extension 15 October`, "b")], [], context);
    expect(items[0]?.slug).not.toBe(items[1]?.slug);
  });
  it("leaves insufficient evidence low-confidence instead of generating a confident generic topic", async () => {
    const items = await provider.enrich([signal("Bengaluru"), signal("Bangalore 0", "b")], [], context);
    expect(items.every((item) => item.confidence < 0.6)).toBe(true);
  });
  it("shares canonical proposals for equivalent stories within a batch", async () => {
    const items = await provider.enrich([signal("Bengaluru metro delays Whitefield"), signal("Bangalore metro delayed in Whitefield", "b")], [], context);
    expect(items[0]?.new_topic).toEqual(items[1]?.new_topic);
  });
  it("does not infer a named place from an author's profile, URL, partial match or multiple areas", async () => {
    const inputs = [signal("Bengaluru metro"), signal("Bengaluru Whitefieldish metro", "b"), signal("Bengaluru metro Whitefield Hebbal", "c")];
    const items = await provider.enrich(inputs, [], context);
    expect(items.map((i) => i.neighborhood)).toEqual(["Citywide", "Citywide", "Unknown"]);
  });
  it("creates bounded factual summaries and produces deterministic results even after an API deadline", async () => {
    const input = signal("Bengaluru metro delay Whitefield " + "discussion ".repeat(22));
    const aborted = new AbortController(); aborted.abort();
    const a = await provider.enrich([input], [], { signal: aborted.signal }), b = await provider.enrich([input], [], context);
    expect(a).toEqual(b); expect(a[0]!.summary.split(/\s+/u).length).toBeLessThanOrEqual(25);
    expect(input.title.toLowerCase()).toContain(a[0]!.summary.replace("Public mentions: ", "").toLowerCase());
    expect(enrichmentBatchSchema.safeParse({ items: a }).success).toBe(true);
  });
});
