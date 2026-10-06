import { beforeEach, describe, expect, it, vi } from "vitest";
import { pulse } from "./helpers";
import { emptyPulse } from "@/lib/server/read";
import { now } from "./helpers";
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
  it("reports stale or unavailable health as 503", async () => {
    vi.mocked(readPulse).mockResolvedValue(pulse({ stale: true, status: "degraded" })); expect((await health()).status).toBe(503);
    vi.mocked(readPulse).mockResolvedValue(emptyPulse(now, "No snapshot")); expect((await health()).status).toBe(503);
    expect((await detail(new Request("https://example.org"), { params: Promise.resolve({ slug: "namma-metro" }) })).status).toBe(503);
  });
});
