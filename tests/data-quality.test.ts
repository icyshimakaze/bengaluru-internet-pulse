import { describe, expect, it } from "vitest";
import { z } from "zod";
import { filterSignal } from "@/lib/ingestion/filters.config";
import { mentionedNeighborhoods, detectBengaluru } from "@/lib/pipeline/location";
import { neighborhoods, gazetteer, coordinates } from "@/lib/domain/places";
import { classifyCategory, HeuristicEnrichmentProvider, topicSimilarity } from "@/lib/enrichment/heuristic";
import { fromSignal, toObservations } from "@/lib/db/mapping";
import { projectDashboard, demoReadState } from "@/lib/server/projections";
import { topicRecordSchema } from "@/lib/db/records";
import { testRepository } from "./database";
import { now, observation } from "./helpers";

describe("retained, configurable noise rules", () => {
  it.each([
    ["Bengaluru #AIJobs #Hiring software engineer", "job_posting"],
    ["Bengaluru automated weather report temperature humidity wind", "weather_bot"],
    ["Bengaluru #a #b #c #d #e #f #g #h", "hashtag_spam"], ["!! https://example.org/a", "near_empty"],
    ["BBMP water cut in Bengaluru", null], ["Cricket rain washout in Bengaluru", null],
  ])("classifies %s", (text, expected) => expect(filterSignal({ title: text, excerpt: text })).toBe(expected));
  it("checks job link hosts and paths without confusing a mention or publisher", () => {
    expect(filterSignal({ title: "Bengaluru engineer", excerpt: "A role is open", canonicalUrl: "https://www.naukri.com/role" })).toBe("job_posting");
    expect(filterSignal({ title: "Bengaluru software discussion", excerpt: "A software discussion", canonicalUrl: "https://naukri.com.example.org/news" })).toBeNull();
    expect(filterSignal({ title: "Bengaluru software discussion", excerpt: "A software discussion", canonicalUrl: "https://linkedin.com/posts/a" })).toBeNull();
    expect(filterSignal({ title: "Short", excerpt: "Short" }, { jobDomains: [], minimumLetters: 3, hashtagLimit: 8 })).toBeNull();
  });
  it("retains a marked job without enrichment attempts, and excludes it before scoring", async () => {
    const repo = testRepository(); await repo.initialize(); const owner = (await repo.acquireLease(now))!;
    const signal = { ...observation("synthetic-job", 0.5), title: "Bengaluru #AIJobs #Hiring", excerpt: "Bengaluru #AIJobs #Hiring", text: "Bengaluru #AIJobs #Hiring" };
    const job = fromSignal(signal);
    expect(job.filterReason).toBe("job_posting");
    await repo.enrichment.collectPending([job], owner, now);
    expect(await repo.enrichment.claimPending(now, false, 30, owner)).toEqual([]);
    expect((await repo.load(now)).items).toHaveLength(1);
    const topic = topicRecordSchema.parse({ id: "topic", slug: "synthetic-topic", canonicalLabel: "Synthetic topic", category: "Technology", neighborhood: null,
      firstSeenAt: signal.publishedAt, lastSeenAt: signal.publishedAt, lifecycle: "NEW", pulseScore: 0, confidence: 0, summary: "Synthetic evidence", enrichmentMethod: "rules", isFixture: false });
    expect(toObservations([{ ...job, topicId: "topic", category: "Technology", localRelevance: 1, enrichmentStatus: "completed" }], [topic])).toEqual([]);
    expect(toObservations([fromSignal(observation("normal", 0.5), { topicId: "topic", category: "Technology", localRelevance: 1, enrichmentStatus: "completed" })], [topic])).toHaveLength(1);
    expect((await repo.client.execute("SELECT filter_reason,enrichment_attempts FROM items")).rows[0]).toMatchObject({ filter_reason: "job_posting", enrichment_attempts: 0 });
    await repo.client.execute("UPDATE items SET filter_reason=NULL");
    await repo.enrichment.recordFilters((await repo.load(now)).items, owner, now);
    expect((await repo.client.execute("SELECT filter_reason,published_at FROM items")).rows[0]).toMatchObject({ filter_reason: "job_posting", published_at: signal.publishedAt });
    const state = demoReadState(now), browse = projectDashboard({ ...state, items: [...state.items, job] }, { window: "24h", category: "jobs" }, now);
    expect(browse.topTopics).toEqual([]); expect(browse.sourceStream).toHaveLength(1);
    expect(browse.sourceStream[0]).toMatchObject({ filterReason: "job_posting", observedCategory: "jobs" });
    await repo.releaseLease(owner);
  });
});

describe("locality gazetteer", () => {
  it("validates 100–150 entries and admits only source-verified centers", () => {
    expect(neighborhoods.length).toBeGreaterThanOrEqual(100); expect(neighborhoods.length).toBeLessThanOrEqual(150);
    for (const name of neighborhoods) {
      const entry = z.object({ aliases: z.array(z.string()).min(1), requiresCityContext: z.boolean(),
        coordinateStatus: z.enum(["verified", "coordinates_unverified"]), coordinates: z.tuple([z.number(), z.number()]).optional(),
        coordinateSource: z.url().optional(), verifiedAt: z.string().optional() }).parse(gazetteer[name]);
      if (entry.coordinateStatus === "verified") { expect(entry.coordinateSource).toMatch(/^https:\/\/www.openstreetmap.org\/(node|relation|way)\/\d+$/u); expect(coordinates[name]).toEqual(entry.coordinates); }
      else expect(coordinates[name]).toBeUndefined();
    }
  });
  it("matches aliases with word boundaries and refuses ambiguous or foreign locations", () => {
    expect(mentionedNeighborhoods("Bengaluru: Malleswaram, HSR and E-City")).toEqual(["Electronic City", "HSR Layout", "Malleshwaram"]);
    expect(mentionedNeighborhoods("Whitefieldish and HSRish")).toEqual([]);
    expect(mentionedNeighborhoods("MG Road near a restaurant")).toEqual([]);
    expect(mentionedNeighborhoods("MG Road Bengaluru")).toEqual(["MG Road"]);
    expect(detectBengaluru("Whitefield in Manchester")).toBe(false);
    expect(mentionedNeighborhoods("https://example.org/Whitefield")).toEqual([]);
  });
  it("keeps unverified locality mentions off the public map", () => {
    const state = demoReadState(now);
    const result = projectDashboard({ ...state, items: state.items.map((i) => ({ ...i, neighborhood: "MG Road" as const })) }, { window: "24h" }, now);
    expect(result.totalSignals).toBeGreaterThan(0); expect(result.hotspots).toEqual([]); expect(coordinates["MG Road"]).toBeUndefined();
    expect(projectDashboard(state, { window: "24h" }, now).hotspots.length).toBeGreaterThan(0);
  });
});

describe("dominant topic and cricket event matching", () => {
  const signal = (id: string, title: string, age = 1) => ({ ...observation(id, age), title, text: title, excerpt: title });
  it.each([["Bengaluru T20I abandoned after rain", "sports"], ["Rain interrupts Bengaluru concert", "events"],
    ["Bengaluru weather forecast rain", "weather"], ["Bengaluru #Hiring #AIJobs", "jobs"],
    ["Bengaluru ward committee drainage plan", "civic"], ["Bengaluru museum heritage walk", "culture"]])("classifies %s", (text, category) => expect(classifyCategory(text)).toBe(category));
  it("merges differently worded synthetic washout reports, independent of input order", async () => {
    const input = [signal("a", "Bengaluru India South Africa T20I washed out after rain"),
      signal("b", "Rain forces India vs South Africa T20I match to be called off in Bangalore"),
      signal("c", "India South Africa T20I abandoned without a ball in Bengaluru")];
    const provider = new HeuristicEnrichmentProvider(), context = { signal: new AbortController().signal };
    const results = await provider.enrich(input, [], context);
    expect(new Set(results.map((r) => r.slug)).size).toBe(1);
    expect(results.every((r) => r.category === "sports")).toBe(true);
    expect((await provider.enrich([...input].reverse(), [], context)).map((r) => r.slug).sort()).toEqual(results.map((r) => r.slug).sort());
    expect(topicSimilarity(input[0]!.title, "India Australia T20I washed out in Bengaluru")).toBe(0);
    expect(topicSimilarity(input[0]!.title, "India South Africa ODI washed out in Bengaluru")).toBe(0);
  });
  it("separates event dates, women's matches and distant same-headline observations", async () => {
    expect(topicSimilarity("India South Africa T20I washout 6 October", "India South Africa T20I washout 7 October")).toBe(0);
    expect(topicSimilarity("India South Africa women T20I washout", "India South Africa T20I washout")).toBe(0);
    const title = "Bengaluru India South Africa T20I washout";
    const rows = await new HeuristicEnrichmentProvider().enrich([signal("early", title, 0.1), signal("late", title, 14)], [], { signal: new AbortController().signal });
    expect(rows[0]!.slug).not.toBe(rows[1]!.slug);
  });
});
