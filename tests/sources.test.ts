import { describe, expect, it } from "vitest";
import { createAdapters } from "@/lib/sources/adapters";
import fixtures from "./fixtures/sources.json";
import { now } from "./helpers";
describe("public source contracts", () => {
  it("validates records independently and preserves discovery timestamps", async () => {
    const adapters = createAdapters(async () => fixtures.gdelt);
    const result = await adapters.gdelt(now, 1000);
    expect(result.signals).toHaveLength(1); expect(result.health.rejected).toBe(1);
    expect(result.signals[0]?.timeKind).toBe("discovered");
    expect(result.signals[0]?.publishedAt).toBe("2026-10-06T10:00:00.000Z");
    expect(result.signals[0]?.title).toBe("Bengaluru & Whitefield metro update");
  });
  it("constructs stable public Bluesky URLs from AT identities", async () => {
    const result = await createAdapters(async () => fixtures.bluesky).bluesky(now, 1000);
    expect(result.signals[0]?.url).toBe("https://bsky.app/profile/did:plc:fixture/post/abc123");
    expect(result.health.rejected).toBe(2);
  });
  it("deduplicates linked Bluesky content while preserving the post permalink", async () => {
    const payload = { posts: [{ ...fixtures.bluesky.posts[0], embed: { external: { uri: "https://example.org/article?utm_source=bsky" } } }] };
    const result = await createAdapters(async () => payload).bluesky(now, 1000);
    expect(result.signals[0]?.canonicalUrl).toBe("https://example.org/article");
    expect(result.signals[0]?.url).toContain("bsky.app/profile/");
  });
  it("preserves HN discussion URLs for stories without an external link", async () => {
    const result = await createAdapters(async () => fixtures.hackernews).hackernews(now, 1000);
    expect(result.signals[0]?.url).toBe("https://news.ycombinator.com/item?id=12345");
  });
  it("distinguishes empty valid results from an invalid envelope", async () => {
    expect((await createAdapters(async () => ({ articles: [] })).gdelt(now, 1000)).health.status).toBe("ok");
    expect((await createAdapters(async () => ({})).gdelt(now, 1000)).health.status).toBe("error");
  });
});
