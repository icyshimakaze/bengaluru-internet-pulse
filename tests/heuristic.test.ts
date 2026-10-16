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
  it.each([
    ["Bengaluru Purple Line metro services disrupted by a signalling fault", "Signal failure delays BMRCL Purple Line trains in Bangalore"],
    ["BWSSB water supply interrupted in Whitefield", "No water in Whitefield Bengaluru after supply cut"],
    ["MIT Bengaluru Inaugurates Quantum-Hub@MAHE", "Manipal Institute of Technology unveils Quantum-Hub@MAHE, a 25-qubit facility in Bengaluru"],
    ["Bengaluru startup Scimplify raised $25 million from Hitachi Ventures", "The Bengaluru company secures funding for specialty chemicals. #Scimplify #AI #SupplyChain"],
  ])("keeps differently worded event headlines together: %s", async (a, b) => {
    const first = await provider.enrich([signal(a)], [], context);
    const second = await provider.enrich([signal(b, "b")], [{ id: "canonical", canonical_label: first[0]!.canonical_label, slug: first[0]!.slug, category: first[0]!.category }], context);
    expect(second[0]!.existing_topic_id).toBe("canonical");
    const batch = await provider.enrich([signal(a), signal(b, "b")], [], context);
    expect(batch[0]!.slug).toBe(batch[1]!.slug);
  });
  it("makes anchored canonical proposals stable when input order changes", async () => {
    const a = signal("Bengaluru Purple Line metro service suspended"), b = signal("BMRCL halts Purple Line trains in Bangalore", "b");
    const first = await provider.enrich([a, b], [], context), reversed = await provider.enrich([b, a], [], context);
    expect(first.map((item) => item.slug)).toEqual(reversed.map((item) => item.slug));
  });
  it.each([
    ["Bengaluru Purple Line metro delay", "Bengaluru Green Line metro delay"],
    ["Bengaluru Purple Line signal failure delays", "Bengaluru Purple Line power failure delays"],
    ["Bengaluru Purple Line metro delay 14 October", "Bengaluru Purple Line metro delay 15 October"],
    ["Bengaluru startup Scimplify raised $25 million", "Bengaluru startup Scimplify raised $30 million"],
    ["Bengaluru startup Scimplify raised $25 million", "Bengaluru startup Othercompany raised $25 million"],
  ])("keeps distinct event anchors separate: %s", async (a, b) => {
    const first = await provider.enrich([signal(a)], [], context);
    const second = await provider.enrich([signal(b, "b")], [{ id: "first", canonical_label: first[0]!.canonical_label, slug: first[0]!.slug, category: first[0]!.category }], context);
    expect(second[0]!.existing_topic_id).toBeNull();
    expect(second[0]!.slug).not.toBe(first[0]!.slug);
  });
  it.each([
    ["KOKO Bangalore Curated Menu Food event 📍 Old Airport Road, Bangalore", "food"],
    ["Bollywood Friday Music event 📍 Varthur Main Road, Whitefield, Bangalore", "events"],
    ["Bollywood Mixtape Arena Music event 📍 Indiranagar Bangalore 🏠 By PEEPAL TREE DEVELOPERS", "events"],
    ["Pizza Making - A Hands-On Cookalong Social event 📍 BEL Road, Bangalore", "food"],
  ])("classifies the activity without address or organizer leakage: %s", (text, expected) => {
    expect(classifyCategory(text)).toBe(expected);
  });
  it("rejects URL-only city/place mentions and ambiguous places outside Bengaluru", () => {
    expect(detectBengaluru("Interesting article https://example.org/bengaluru/whitefield")).toBe(false);
    expect(detectBengaluru("Traffic on MG Road in Gurugram")).toBe(false);
    expect(detectBengaluru("Rain in Whitefield Manchester")).toBe(false);
  });
  it("uses supplied local canonical evidence for a distinctive named event without a repeated city word", async () => {
    const a = signal("MIT Bengaluru Inaugurates Quantum-Hub@MAHE");
    const b = signal("Manipal Institute of Technology unveils Quantum-Hub@MAHE, a 25-qubit facility", "b");
    const results = await provider.enrich([a, b], [], context);
    expect(results.map((item) => item.local_relevance)).toEqual([1, 1]);
    expect(results[0]!.slug).toBe(results[1]!.slug);
    const reversed = await provider.enrich([b, a], [], context);
    expect(reversed.map((item) => item.slug)).toEqual(results.map((item) => item.slug));
    const foreign = await provider.enrich([signal(b.title + " in Mumbai")], [{ id: "local", canonical_label: results[0]!.canonical_label, slug: results[0]!.slug, category: results[0]!.category }], context);
    expect(foreign[0]!.local_relevance).toBe(0);
  });
  it("keeps a funding event stable when a headline without its amount arrives first in the batch", async () => {
    const a = signal("Bengaluru startup Scimplify raised $25 million"), b = signal("The Bengaluru company secures funding. #Scimplify", "b");
    const forward = await provider.enrich([a, b], [], context), reversed = await provider.enrich([b, a], [], context);
    expect(forward.map((item) => item.slug)).toEqual(reversed.map((item) => item.slug));
  });
  it("keeps different vacancies and seniority separate even when their truncated labels are nearly identical", async () => {
    const a = "Custom Software Engineering Lead - Bengaluru, BDC14A Job educativ.net/jobs/job/66895...";
    const b = "Custom Software Engineering Lead - Bengaluru, BDC14A Job educativ.net/jobs/job/66940...";
    const items = await provider.enrich([signal(a), signal(b, "b")], [], context);
    expect(items[0]!.canonical_label).not.toBe(items[1]!.canonical_label);
    expect(items[0]!.canonical_label).toContain("66895");
    expect(topicSimilarity(a, b)).toBe(0);
    expect(topicSimilarity("Business Transformation Manager Job 66951", "Business Transformation Senior Manager Job 66951")).toBe(0);
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
