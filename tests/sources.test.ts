import { describe, expect, it, vi } from "vitest";
import { createAdapters } from "@/lib/sources/adapters";
import { normalizedSignalSchema, sources } from "@/lib/domain/schema";
import { fetchJson, type Transport } from "@/lib/sources/http";
import fixtures from "@/fixtures/public-sources.json";
import { now } from "./helpers";

const payloads = { gdelt: fixtures.gdelt, bluesky: fixtures.bluesky, hackernews: fixtures.hackernews };
describe("public source contracts", () => {
  it("stops remaining throttled-provider requests while other sources continue", async () => {
    const transport = vi.fn<Transport>().mockImplementation(async (url) => {
      if (new URL(url).hostname === "api.gdeltproject.org") throw new Error("HTTP_429");
      return new URL(url).hostname.includes("bsky") ? { posts: [] } : { hits: [] };
    });
    const adapters = createAdapters(transport);
    const results = await Promise.all(sources.map((source) => adapters[source](now, 1000)));
    expect(transport.mock.calls.filter(([url]) => new URL(url).hostname === "api.gdeltproject.org")).toHaveLength(1);
    expect(results[0]?.health).toMatchObject({ status: "error", failedQueries: 1, error: "HTTP_429" });
    expect(results.slice(1).every((result) => result.health.status === "ok")).toBe(true);
  });
  it.each(sources)("returns the normalized interface, validates siblings and deduplicates overlapping %s queries", async (source) => {
    const result = await createAdapters(async () => payloads[source])[source](now, 1000);
    const queries = source === "gdelt" ? 1 : source === "bluesky" ? 10 : 2;
    expect(result.signals).toHaveLength(1);
    expect(normalizedSignalSchema.safeParse(result.signals[0]).success).toBe(true);
    expect(result.signals[0]?.sourceType).toBe(source === "gdelt" ? "news" : source === "bluesky" ? "social" : "tech");
    expect(result.health).toMatchObject({ status: "ok", queries, fetched: queries * 2, accepted: queries, rejected: queries, duplicates: queries - 1, failedQueries: 0 });
  });
  it("uses one broad GDELT request with its documented result cap and explicit recent JSON window", async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({ articles: [] });
    await createAdapters(transport).gdelt(now, 1000);
    const requests = transport.mock.calls.map((call) => new URL(String(call[0])));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.searchParams.get("query")).toBe("(Bengaluru OR Bangalore)");
    for (const url of requests) {
      expect(url.searchParams.get("mode")).toBe("artlist");
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("sort")).toBe("datedesc");
      expect(url.searchParams.get("startdatetime")).toBe("20261005103000");
      expect(url.searchParams.get("enddatetime")).toBe("20261006103000");
      expect(Number(url.searchParams.get("maxrecords"))).toBe(250);
    }
    const result = await createAdapters(async () => fixtures.gdelt).gdelt(now, 1000);
    expect(result.signals[0]).toMatchObject({ timeKind: "discovered", publishedAt: "2026-10-06T10:00:00.000Z", title: "Bengaluru & Whitefield metro update", domain: "example.org" });
  });
  it("searches broad city terms through the unauthenticated public AppView", async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({ posts: [] });
    await createAdapters(transport).bluesky(now, 1000);
    const urls = transport.mock.calls.map((call) => new URL(String(call[0])));
    expect(urls.map((url) => url.searchParams.get("q"))).toEqual(["Bengaluru", "Bangalore", "Namma Metro", "ಬೆಂಗಳೂರು", "Whitefield", "Koramangala", "Indiranagar", "HSR Layout", "Bellandur", "Electronic City"]);
    for (const [index, url] of urls.entries()) {
      expect(url.origin).toBe("https://api.bsky.app");
      expect(url.pathname).toBe("/xrpc/app.bsky.feed.searchPosts");
      expect(url.searchParams.get("sort")).toBe("latest");
      expect(url.searchParams.get("limit")).toBe(index < 2 ? "100" : "50");
      expect(url.searchParams.get("since")).toBe("2026-10-05T10:30:00.000Z");
      expect(url.searchParams.get("until")).toBe(now.toISOString());
    }
  });
  it("preserves the Bluesky post permalink, linked-content identity and no profile data", async () => {
    const payload = { posts: [{ ...fixtures.bluesky.posts[0], embed: { external: { uri: "https://example.org/article?utm_source=bsky" } } }] };
    const result = await createAdapters(async () => payload).bluesky(now, 1000);
    expect(result.signals[0]).toMatchObject({ canonicalUrl: "https://example.org/article", domain: "example.org", url: "https://bsky.app/profile/did:plc:fixture/post/abc123" });
    expect(JSON.stringify(result.signals)).not.toMatch(/author|handle|displayName|avatar|likeCount|replyCount|Must never be persisted/);
  });
  it("ignores malformed optional embeds and supports record-with-media links", async () => {
    for (const embed of [{ external: { uri: "javascript:alert(1)" } }, { media: { external: { uri: "https://example.org/media" } } }]) {
      const result = await createAdapters(async () => ({ posts: [{ ...fixtures.bluesky.posts[0], embed }] })).bluesky(now, 1000);
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0]?.canonicalUrl).toBe("media" in embed ? "https://example.org/media" : "https://bsky.app/profile/did:plc:fixture/post/abc123");
    }
  });
  it("retains supplied article metadata needed for event identity and local relevance without changing post provenance", async () => {
    const post = { ...fixtures.bluesky.posts[0], record: { text: "A new quantum facility", createdAt: "2026-10-06T10:00:00.000Z" },
      embed: { external: { uri: "https://publisher.org/quantum", title: "MIT Bengaluru launches Quantum-Hub@MAHE", description: "A 25-qubit facility in Bengaluru." } } };
    const result = await createAdapters(async () => ({ posts: [post] })).bluesky(now, 1000);
    expect(result.signals[0]).toMatchObject({ title: "A new quantum facility", publishedAt: post.record.createdAt, timeKind: "published", url: "https://bsky.app/profile/did:plc:fixture/post/abc123" });
    expect(result.signals[0]?.excerpt).toContain("MIT Bengaluru launches Quantum-Hub@MAHE");
  });
  it("uses both HN search_by_date queries, bounded stories and the source discussion link", async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({ hits: [] });
    await createAdapters(transport).hackernews(now, 1000);
    const urls = transport.mock.calls.map((call) => new URL(String(call[0])));
    expect(urls.map((url) => url.searchParams.get("query"))).toEqual(["Bengaluru", "Bangalore"]);
    for (const url of urls) {
      expect(url.pathname).toBe("/api/v1/search_by_date");
      expect(url.searchParams.get("tags")).toBe("(story,comment)");
      expect(url.searchParams.get("hitsPerPage")).toBe("50");
      expect(url.searchParams.get("numericFilters")).toBe(`created_at_i>=${Math.floor((now.getTime() - 86400000) / 1000)},created_at_i<=${Math.floor(now.getTime() / 1000)}`);
    }
    const payload = { hits: [{ ...fixtures.hackernews.hits[0], url: "https://example.org/story?utm_source=hn", story_text: "<p>Bengaluru software <b>discussion</b></p>" }] };
    const result = await createAdapters(async () => payload).hackernews(now, 1000);
    expect(result.signals[0]).toMatchObject({ url: "https://news.ycombinator.com/item?id=12345", canonicalUrl: "https://example.org/story", domain: "example.org", excerpt: "Bengaluru software discussion" });
    expect(JSON.stringify(result.signals)).not.toMatch(/author|points|num_comments|fictional-user/);
  });
  it("preserves HN stories without external links", async () => {
    const result = await createAdapters(async () => fixtures.hackernews).hackernews(now, 1000);
    expect(result.signals[0]?.url).toBe("https://news.ycombinator.com/item?id=12345");
    expect(result.signals[0]?.domain).toBe("news.ycombinator.com");
  });
  it("retains public HN comments with comment timestamps and original discussion links, without profile data", async () => {
    const payload = { hits: [{ objectID: "99901", _tags: ["comment"], story_title: "Ask HN: Where do you work?",
      comment_text: "<p>I work with a Bengaluru software team in Whitefield.</p>", created_at: "2026-10-06T10:00:00Z", author: "PRIVATE_PROFILE", points: 12 },
    { objectID: "99902", story_title: "Missing comment tag", comment_text: "Bengaluru", created_at: "2026-10-06T10:00:00Z" }] };
    const result = await createAdapters(async () => payload).hackernews(now, 1000);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({ sourceId: "99901", title: "Discussion: Ask HN: Where do you work?",
      url: "https://news.ycombinator.com/item?id=99901", canonicalUrl: "https://news.ycombinator.com/item?id=99901",
      publishedAt: "2026-10-06T10:00:00.000Z", excerpt: "I work with a Bengaluru software team in Whitefield." });
    expect(JSON.stringify(result.signals)).not.toMatch(/PRIVATE_PROFILE|author|points/);
    expect(result.health.rejected).toBe(2);
  });
  it.each(["bluesky", "hackernews"] as const)("keeps successful %s query results when another query fails", async (source) => {
    let calls = 0;
    const result = await createAdapters(async () => {
      if (++calls === 1) throw new Error("HTTP_503");
      return payloads[source];
    })[source](now, 1000);
    expect(result.signals).toHaveLength(1);
    expect(result.health).toMatchObject({ status: "partial", failedQueries: 1, error: "PARTIAL_QUERY_FAILURE" });
  });
  it.each(sources)("handles a complete %s outage without throwing", async (source) => {
    const result = await createAdapters(async () => { throw new Error("HTTP_403"); })[source](now, 1000);
    expect(result.signals).toEqual([]);
    expect(result.health).toMatchObject({ status: "error", fetched: 0, accepted: 0, error: "HTTP_403" });
    expect(result.health.failedQueries).toBe(result.health.queries);
  });
  it.each(sources)("retries temporary HTTP failures through the shared %s transport", async (source) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockImplementation(async () => Response.json(payloads[source]));
    const adapter = createAdapters((url, options) => fetchJson(url, { ...options, minIntervalMs: 0, fetcher }))[source];
    const result = await adapter(now, 1000);
    expect(result.health.status).toBe("ok");
    expect(result.signals).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(result.health.queries! + 1);
    for (const call of fetcher.mock.calls) {
      expect(new Headers(call[1]?.headers).has("Authorization")).toBe(false);
      expect(call[1]?.credentials).toBe("omit");
    }
  });
  it.each(sources)("distinguishes valid empty %s envelopes from malformed responses", async (source) => {
    const empty = source === "gdelt" ? { articles: [] } : source === "bluesky" ? { posts: [] } : { hits: [] };
    expect((await createAdapters(async () => empty)[source](now, 1000)).health.status).toBe("ok");
    const invalid = await createAdapters(async () => ({}))[source](now, 1000);
    expect(invalid.health).toMatchObject({ status: "error", error: "INVALID_PAYLOAD" });
  });
  it("rejects old/future records inside an otherwise valid query response", async () => {
    const original = fixtures.bluesky.posts[0]!;
    const payload = { posts: [original,
      { ...original, uri: original.uri + "old", record: { text: "Bengaluru old news", createdAt: "2026-10-05T10:29:59.999Z" } },
      { ...original, uri: original.uri + "future", record: { text: "Bengaluru future news", createdAt: "2026-10-06T10:30:00.001Z" } },
    ] };
    const result = await createAdapters(async () => payload).bluesky(now, 1000);
    expect(result.signals).toHaveLength(1);
    expect(result.health.rejected).toBe(20);
  });
  it("bounds concurrency and the whole source even when a transport ignores abort", async () => {
    let active = 0, peak = 0;
    const transport = async () => {
      active++; peak = Math.max(active, peak);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--; return { posts: [] };
    };
    await createAdapters(transport).bluesky(now, 1000);
    expect(peak).toBe(2);
    const paced = vi.fn<Transport>().mockResolvedValue({ articles: [] });
    await createAdapters(paced).gdelt(now, 1000);
    expect(paced.mock.calls.every((call) => call[1]?.minIntervalMs === 5500)).toBe(true);
    const result = await createAdapters(() => new Promise(() => {}), { budgetMs: 25 }).gdelt(now, 1000);
    expect(result.health).toMatchObject({ status: "error", failedQueries: 1, error: "TIMEOUT" });
  });
  it("rejects oversized result arrays instead of accepting an unbounded source", async () => {
    const result = await createAdapters(async () => ({ posts: Array.from({ length: 101 }, () => fixtures.bluesky.posts[0]) })).bluesky(now, 1000);
    expect(result.health).toMatchObject({ status: "error", error: "RESULT_LIMIT_EXCEEDED" });
    expect(result.signals).toEqual([]);
  });
  it("emits sanitized structured counters and query error codes", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {}), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createAdapters(async () => fixtures.bluesky).bluesky(now, 1000);
    await createAdapters(async () => { throw new Error("HTTP_429"); }).hackernews(now, 1000);
    const rows = [...info.mock.calls, ...warn.mock.calls].map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ event: "source.completed", duplicates: 9, returned: 1 }),
      expect.objectContaining({ event: "source.query_failed", code: "HTTP_429", source: "hackernews" })]));
    expect(JSON.stringify(rows)).not.toMatch(/fictional.invalid|Fixture profile|Bengaluru rain discussion/);
  });
});
