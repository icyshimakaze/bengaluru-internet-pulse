import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createRssAdapter, parseFeedDate, parseFeedXml } from "@/lib/sources/rss";
import { robotsPolicy } from "@/lib/sources/robots";
import { fetchJson } from "@/lib/sources/http";
import { feedSchema, RSS_USER_AGENT } from "@/lib/sources/feeds.config";
import { now } from "./helpers";
import { observation } from "./helpers";
import { testRepository } from "./database";
import { fromSignal, toSignal } from "@/lib/db/mapping";
import { deduplicate } from "@/lib/pipeline/normalize";
import { createHackerNewsAdapter } from "@/lib/sources/hackernews";
import { evaluateTopics } from "@/lib/trends/engine";
import { topic } from "./helpers";
const rss = readFileSync("tests/fixtures/local-news.rss.xml", "utf8"), atom = readFileSync("tests/fixtures/local-news.atom.xml", "utf8");
const feed = feedSchema.parse({ id: "synthetic", name: "Synthetic local paper", url: "https://example.org/feed/", termsStatus: "unchecked", localOnly: false });

describe("bounded, attributed RSS and Atom collection", () => {
  it("accepts RSS/Atom, preserves dates/links and discards authors/full content", () => {
    const rows = parseFeedXml(rss, feed);
    expect(rows[0]).toMatchObject({ title: "Bengaluru synthetic metro report", url: "https://example.org/metro", publishedAt: "2026-10-06T10:00:00.000Z", publisherName: feed.name });
    expect(rows.slice(1)).toEqual([null, null]);
    expect(JSON.stringify(rows)).not.toContain("FULL BODY");
    const atoms = parseFeedXml(atom, feed);
    expect(atoms[0]).toMatchObject({ url: "https://example.org/civic", publishedAt: "2026-10-06T10:00:00.000Z" });
    expect(atoms[1]).toBeNull(); expect(JSON.stringify(atoms)).not.toContain("PRIVATE AUTHOR");
    expect(JSON.stringify(atoms)).not.toContain("FULL BODY");
  });
  it("requires real dates and rejects XML declarations that could expand entities", () => {
    expect(parseFeedDate("Tue, 06 Oct 2026 15:30:00 +0530")).toBe("2026-10-06T10:00:00.000Z");
    expect(parseFeedDate("2026-02-30T10:00:00Z")).toBeNull();
    expect(parseFeedDate("Tue, 30 Feb 2026 10:00:00 GMT")).toBeNull();
    expect(parseFeedDate("2026-10-06 10:00:00")).toBeNull();
    expect(() => parseFeedXml('<!DOCTYPE rss [<!ENTITY x "a">]><rss/>', feed)).toThrow("RSS_INVALID_XML");
    expect(() => parseFeedXml("<rss><channel></rss>", feed)).toThrow("RSS_INVALID_XML");
    expect(() => parseFeedXml("<html>error</html>", feed)).toThrow("RSS_INVALID_XML");
  });
  it("honors robots, user-agent and response limits with independent feed failures", async () => {
    const other = { ...feed, id: "failed", url: "https://other.example.org/feed/" };
    const transport = vi.fn(async (url: string) => {
      if (url === "https://other.example.org/robots.txt") throw new Error("HTTP_503");
      return url.endsWith("robots.txt") ? "User-agent: *\nAllow: /\nCrawl-delay: 2" : rss;
    });
    const result = await createRssAdapter(transport, { feeds: [feed, other] })(now, 1000);
    expect(result.health).toMatchObject({ status: "partial", queries: 2, failedQueries: 1, fetched: 3, accepted: 1, rejected: 2 });
    expect(result.signals[0]).toMatchObject({ source: "rss", sourceType: "news", publisherName: feed.name });
    const call = transport.mock.calls.find(([url]) => url === feed.url)!;
    expect(call[0]).toBe(feed.url);
    const request = (transport.mock.calls as unknown as Array<[string, { responseFormat: string; minIntervalMs: number; init: { headers: { "User-Agent": string } } }]>).find(([url]) => url === feed.url)![1];
    expect(request).toMatchObject({ responseFormat: "text", minIntervalMs: 2000, init: { headers: { "User-Agent": RSS_USER_AGENT } } });
  });
  it("does not fetch a disallowed feed, accept unsafe URLs, or fabricate empty evidence", async () => {
    const transport = vi.fn(async () => "User-agent: BengaluruPulse\nDisallow: /");
    const result = await createRssAdapter(transport, { feeds: [feed] })(now, 1000);
    expect(result.health).toMatchObject({ status: "error", error: "RSS_ROBOTS_DISALLOWED" });
    expect(transport).toHaveBeenCalledTimes(1); expect(result.signals).toEqual([]);
    const empty = await createRssAdapter(async (url) => url.endsWith("robots.txt") ? "" : "<rss><channel/></rss>", { feeds: [feed] })(now, 1000);
    expect(empty.health.status).toBe("ok"); expect(empty.signals).toEqual([]);
    const hugeDelay = await createRssAdapter(async () => "User-agent: *\nCrawl-delay: 30", { feeds: [feed] })(now, 1000);
    expect(hugeDelay.health.error).toBe("RSS_CRAWL_DELAY_EXCEEDS_BUDGET");
  });
  it("uses the existing bounded streaming transport for XML too", async () => {
    const fetcher = vi.fn(async () => new Response(rss));
    expect(await fetchJson(feed.url, { responseFormat: "text", fetcher })).toBe(rss);
    const large = vi.fn(async () => new Response("x", { headers: { "content-length": "3000000" } }));
    await expect(fetchJson(feed.url, { responseFormat: "text", fetcher: large })).rejects.toThrow("RESPONSE_TOO_LARGE");
  });
  it("persists RSS publisher provenance and deduplicates an article already found through another index", async () => {
    const repo = testRepository(); await repo.initialize();
    const result = await createRssAdapter(async (url) => url.endsWith("robots.txt") ? "" : rss, { feeds: [feed] })(now, 1000);
    const row = fromSignal(result.signals[0]!); await repo.insertItem(row);
    const stored = (await repo.load(now)).items[0]!;
    expect(stored).toMatchObject({ publisherName: feed.name, source: "rss", publishedAt: row.publishedAt });
    expect(deduplicate([{ ...toSignal(stored), id: "second-index", source: "gdelt", sourceId: "second-index" }], [toSignal(stored)])).toEqual([]);
    const five = ["gdelt", "bluesky", "hackernews", "currents", "rss"].map((source, i) => observation(`five-${i}`, 0.2 + i / 10, source as "gdelt" | "bluesky" | "hackernews" | "currents" | "rss"));
    expect(evaluateTopics([topic], five, now)[0]).toMatchObject({ sourceCount: 5, diversity: 1 });
  });
  it("keeps Hacker News but requires explicit local text rather than a search hit or URL", async () => {
    const result = await createHackerNewsAdapter(async () => ({ hits: [
      { objectID: "1", title: "Unrelated synthetic software report", url: "https://example.org/Bengaluru", created_at: "2026-10-06T10:00:00Z" },
      { objectID: "2", title: "Bengaluru synthetic software report", url: "https://example.org/local", created_at: "2026-10-06T10:00:00Z" },
    ] }))(now, 1000);
    expect(result.signals).toHaveLength(1); expect(result.signals[0]?.sourceId).toBe("2");
    expect(result.health.rejected).toBe(2);
  });
});
describe("robots policy", () => {
  it("uses specific groups, longest rules, wildcards, end anchors and allow ties", () => {
    const rules = "User-agent: *\nDisallow: /\nUser-agent: BengaluruPulse\nDisallow: /private/*\nAllow: /private/feed$\nCrawl-delay: 3";
    expect(robotsPolicy(rules, "https://example.org/private/feed")).toEqual({ allowed: true, crawlDelayMs: 3000 });
    expect(robotsPolicy(rules, "https://example.org/private/feed/other").allowed).toBe(false);
    expect(robotsPolicy(rules, "https://example.org/public").allowed).toBe(true);
    expect(robotsPolicy("User-agent: *\nDisallow: /feed\nAllow: /feed", feed.url).allowed).toBe(true);
  });
});
