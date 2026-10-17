import { beforeEach, describe, expect, it, vi } from "vitest";
import { now } from "./helpers";
import { lifecycles } from "@/lib/domain/schema";
import { readQuerySchema, dashboardQuerySchema, hotspotsResponseSchema, topicListQuerySchema } from "@/lib/domain/read-models";
import { demoReadState, emptyReadState, projectDashboard, projectHealth, projectTopic, projectTopicList } from "@/lib/server/projections";
vi.mock("@/lib/server/queries", async (original) => ({ ...await original<typeof import("@/lib/server/queries")>(),
  readDashboard: vi.fn(), readTopics: vi.fn(), readTopic: vi.fn(), readHealth: vi.fn(), readHotspots: vi.fn() }));
import { readDashboard, readTopics, readTopic, readHealth, readHotspots, ReadUnavailableError } from "@/lib/server/queries";
import { GET as pulse } from "@/app/api/pulse/route";
import { GET as topics } from "@/app/api/topics/route";
import { GET as detail } from "@/app/api/topics/[slug]/route";
import { GET as hotspots } from "@/app/api/hotspots/route";
import { GET as health } from "@/app/api/health/route";
const request = (path = "") => new Request("https://example.org/api/" + path);
const topicRequest = (slug: string) => detail(request("topics/" + slug), { params: Promise.resolve({ slug }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readDashboard).mockImplementation(async (query = {}) => projectDashboard(demoReadState(now), dashboardQuerySchema.parse(query), now));
  vi.mocked(readTopics).mockImplementation(async (query = {}) => projectTopicList(demoReadState(now), topicListQuerySchema.parse(query), now));
  vi.mocked(readTopic).mockImplementation(async (slug) => projectTopic(demoReadState(now, slug), slug, now));
  vi.mocked(readHealth).mockResolvedValue(projectHealth({ generatedAt: now.toISOString(), sources: demoReadState(now).snapshot!.sources,
    sourceRuns: [], lastIngestion: null, lastSuccessfulIngestion: null, recentSignalCount: 221 }, now, "not_required", "demo"));
  vi.mocked(readHotspots).mockImplementation(async (query = {}) => {
    const d = projectDashboard(demoReadState(now), readQuerySchema.parse(query), now);
    return hotspotsResponseSchema.parse({ mode: d.mode, status: d.status, generatedAt: d.generatedAt, stale: d.stale,
      snapshot: d.snapshot, window: d.window, hotspots: d.hotspots, locationBasis: "Explicit neighborhood mentions" });
  });
});
describe("public read API contracts", () => {
  it.each([["2h", 79], ["6h", 119], ["24h", 221]])("supports the %s selection window with complete counts", async (window, count) => {
    const response = await pulse(request("pulse?window=" + window)), data = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(data.window).toBe(window); expect(data.signalCount).toBe(count);
    expect(data.snapshot).toMatchObject({ scoringWindow: "2h", queryWindow: window, algorithmVersion: "v2" });
    expect(data.topTopics).toHaveLength(6); expect(data.risingTopics.every((t: { lifecycle: string }) => ["HOT", "RISING", "EMERGING"].includes(t.lifecycle))).toBe(true);
    expect(data.sourceStream).toHaveLength(30); expect(data.streamTruncated).toBe(true);
    expect(data.availableSources).toEqual(["gdelt", "bluesky", "hackernews"]); expect(data.lastSuccessfulIngestion).toBeNull();
  });
  it.each(["window=3h", "window=", "category=Unknown", "source=reddit", "limit=100000", "window=2h&window=24h", "source=gdelt&source=bluesky", "OPENAI_API_KEY=secret"])("rejects invalid pulse query %s before reading", async (query) => {
    expect((await pulse(request("pulse?" + query))).status).toBe(400); expect(readDashboard).not.toHaveBeenCalled();
  });
  it("applies category/source filters without rescoring the selected provider", async () => {
    const data = await (await pulse(request("pulse?window=6h&category=Technology&source=gdelt"))).json();
    expect(data.topTopics).toHaveLength(1); expect(data.topTopics[0]).toMatchObject({ slug: "startup-ecosystem", sourceCount: 3, current2h: 13 });
    expect(data.sourceStream.every((s: { source: string; topicSlug: string }) => s.source === "gdelt" && s.topicSlug === "startup-ecosystem")).toBe(true);
    const empty = await pulse(request("pulse?category=Civic")); expect(empty.status).toBe(200); expect((await empty.json()).topTopics).toEqual([]);
  });
  it("validates topic list filters and preserves rank order", async () => {
    expect((await topics(request("topics?limit=0"))).status).toBe(400);
    expect((await topics(request("topics?category=Unknown"))).status).toBe(400);
    const data = await (await topics(request("topics?category=Mobility&limit=1"))).json();
    expect(data.topics).toHaveLength(1); expect(data.topics[0].slug).toBe("namma-metro");
    for (const lifecycle of lifecycles) {
      const response = await topics(request("topics?lifecycle=" + lifecycle)); expect(response.status).toBe(200);
      for (const t of (await response.json()).topics) expect(t.lifecycle).toBe(lifecycle);
    }
    expect((await topics(request("topics?lifecycle=steady"))).status).toBe(400);
  });
  it("returns topic metrics, versioned history, bounded evidence and related signals", async () => {
    const response = await topicRequest("namma-metro"), data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ summary: expect.any(String), pulseScore: expect.any(Number), confidence: expect.any(Number), lifecycle: "HOT",
      growth: { current2h: 24, previous2h: 5, ratio: 25 / 6 }, evidenceTruncated: true, historyTruncated: false });
    expect(data.history.at(-1)).toMatchObject({ algorithmVersion: "v2", pulseScore: data.pulseScore });
    expect(data.sourceEvidence).toHaveLength(30); expect(data.relatedSignals.length).toBeGreaterThan(0);
    expect(data.relatedSignals.every((s: { topicSlug: string }) => s.topicSlug !== "namma-metro")).toBe(true);
  });
  it("returns 400 for malformed slugs/parameters, 404 for missing topics and 503 for unavailable storage", async () => {
    expect((await topicRequest("bad' OR 1=1 --")).status).toBe(400); expect(readTopic).not.toHaveBeenCalled();
    expect((await topicRequest("missing")).status).toBe(404);
    expect((await detail(request("topics/namma-metro?source=gdelt"), { params: Promise.resolve({ slug: "namma-metro" }) })).status).toBe(400);
    vi.mocked(readTopic).mockRejectedValue(new ReadUnavailableError());
    const unavailable = await topicRequest("namma-metro"); expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "Live data unavailable", code: "READ_UNAVAILABLE" });
  });
  it("returns hotspot activity, mean/top pulse and top topic with validated filters", async () => {
    const data = await (await hotspots(request("hotspots?window=6h&category=Weather"))).json();
    expect(data.hotspots).toHaveLength(1);
    expect(data.hotspots[0]).toMatchObject({ neighborhood: "Hebbal", activity: expect.any(Number), averagePulse: expect.any(Number),
      topPulse: expect.any(Number), topTopic: { slug: "rain-and-waterlogging" } });
    expect((await hotspots(request("hotspots?window=12h"))).status).toBe(400);
    expect((await hotspots(request("hotspots?source=gdelt&source=gdelt"))).status).toBe(400);
  });
  it("reports application/database/source health without exposing credentials or raw errors", async () => {
    const response = await health(), data = await response.json(); expect(response.status).toBe(200);
    expect(data).toMatchObject({ application: { status: "ok" }, database: { status: "not_required" }, recentSignalCount: 221, simulated: true, lastIngestion: null });
    const unavailable = projectHealth({ generatedAt: null, sources: [], sourceRuns: [], lastIngestion: null, lastSuccessfulIngestion: null, recentSignalCount: 0 }, now, "unavailable");
    vi.mocked(readHealth).mockResolvedValue(unavailable); expect((await health()).status).toBe(503);
    expect(unavailable.recentSignalCount).toBeNull();
    expect((await health(request("health?token=private"))).status).toBe(400);
  });
  it("returns an explicit unavailable dashboard without substituting fixtures", async () => {
    vi.mocked(readDashboard).mockResolvedValue(projectDashboard(emptyReadState(now), { window: "2h" }, now));
    const response = await pulse(); expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ mode: "live", generatedAt: null, topTopics: [], sourceStream: [], availableSources: [] });
  });
  it("omits persistence identifiers, fingerprints, prompts and duplicate text from every response", async () => {
    for (const response of [await pulse(), await topicRequest("namma-metro"), await hotspots(), await health()]) {
      const data = await response.json();
      const inspect = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        for (const [key, nested] of Object.entries(value)) {
          expect(["sourceId", "canonicalUrl", "contentHash", "contentFingerprint", "text", "batchId", "topicId", "errorMessage", "OPENAI_API_KEY", "TURSO_AUTH_TOKEN", "TURSO_DATABASE_URL"]).not.toContain(key);
          inspect(nested);
        }
      };
      inspect(data);
    }
  });
});
