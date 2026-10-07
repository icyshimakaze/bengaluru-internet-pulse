import { beforeEach, describe, expect, it, vi } from "vitest";
import { pulse } from "./helpers";
import { emptyPulse } from "@/lib/server/read";
import { now } from "./helpers";
import { lifecycles } from "@/lib/domain/schema";
vi.mock("@/lib/server/read", async (original) => ({ ...await original<typeof import("@/lib/server/read")>(), readPulse: vi.fn() }));
import { readPulse } from "@/lib/server/read";
import { GET as topics } from "@/app/api/topics/route";
import { GET as detail } from "@/app/api/topics/[slug]/route";
import { GET as health } from "@/app/api/health/route";
beforeEach(() => { vi.mocked(readPulse).mockResolvedValue(pulse()); });
describe("read API contracts", () => {
  it("validates filters and preserves rank order", async () => {
    expect((await topics(new Request("https://example.org/api/topics?limit=0"))).status).toBe(400);
    expect((await topics(new Request("https://example.org/api/topics?category=Unknown"))).status).toBe(400);
    const result = await topics(new Request("https://example.org/api/topics?category=Mobility&limit=1"));
    const data = await result.json(); expect(data.topics).toHaveLength(1); expect(data.topics[0].slug).toBe("namma-metro");
  });
  it("returns 404 for missing topics", async () => { expect((await detail(new Request("https://example.org"), { params: Promise.resolve({ slug: "missing" }) })).status).toBe(404); });
  it("accepts all six lifecycle filters and exposes bounded two-hour scoring metrics", async () => {
    for (const lifecycle of lifecycles) {
      const response = await topics(new Request("https://example.org/api/topics?lifecycle=" + lifecycle));
      expect(response.status).toBe(200);
      const data = await response.json();
      for (const t of data.topics) expect(t.lifecycle).toBe(lifecycle);
    }
    expect((await topics(new Request("https://example.org/api/topics?lifecycle=steady"))).status).toBe(400);
    const response = await detail(new Request("https://example.org"), { params: Promise.resolve({ slug: "namma-metro" }) });
    const data = await response.json();
    expect(data.topic).toMatchObject({ current2h: expect.any(Number), previous2h: expect.any(Number), count6h: expect.any(Number),
      count24h: expect.any(Number), sourceCount: 3, growthRatio: expect.any(Number), firstSeenAt: expect.any(String),
      latestSignalAgeHours: expect.any(Number), clusterConsistency: expect.any(Number), confidence: expect.any(Number) });
    expect(data.topic.growthPercent).toBeLessThanOrEqual(300);
    expect(data.topic.score).toBeLessThanOrEqual(data.topic.scoreCap);
  });
  it("reports stale or unavailable health as 503", async () => {
    vi.mocked(readPulse).mockResolvedValue(pulse({ stale: true, status: "degraded" })); expect((await health()).status).toBe(503);
    vi.mocked(readPulse).mockResolvedValue(emptyPulse(now, "No snapshot")); expect((await health()).status).toBe(503);
    expect((await detail(new Request("https://example.org"), { params: Promise.resolve({ slug: "namma-metro" }) })).status).toBe(503);
  });
});
