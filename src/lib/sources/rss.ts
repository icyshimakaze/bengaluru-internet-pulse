import "server-only";
import { z } from "zod";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { normalize, cleanText } from "@/lib/pipeline/normalize";
import { detectBengaluru } from "@/lib/pipeline/location";
import { httpUrlSchema } from "@/lib/domain/urls";
import { collectSource } from "./collector";
import { fetchJson, type Transport } from "./http";
import { feeds, feedSchema, RSS_USER_AGENT, type Feed } from "./feeds.config";
import { robotsPolicy } from "./robots";
import type { AdapterOptions } from "./types";

const object = z.record(z.string(), z.unknown());
const list = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown): string => typeof value === "string" ? value : object.safeParse(value).success ? text(object.parse(value)["#text"]) : "";
const entrySchema = z.object({ title: z.string().min(3).max(300), url: httpUrlSchema,
  publishedAt: z.iso.datetime(), excerpt: z.string().min(3).max(600), publisherName: z.string().min(1).max(100) }).strict();

export function parseFeedDate(date: string): string | null {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const rfc = date.match(/^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(GMT|UTC|[+-]\d{4})$/u);
  const iso = rfc ? `${rfc[3]}-${String(months.indexOf(rfc[2]!) + 1).padStart(2, "0")}-${rfc[1]!.padStart(2, "0")}T${rfc[4]}${/GMT|UTC/u.test(rfc[5]!) ? "Z" : rfc[5]!.slice(0, 3) + ":" + rfc[5]!.slice(3)}` : date;
  const parsed = z.iso.datetime({ offset: true }).safeParse(iso);
  return parsed.success ? new Date(parsed.data).toISOString() : null;
}
export function parseFeedXml(xml: string, feed: Feed): Array<z.infer<typeof entrySchema> | null> {
  z.string().max(2 * 1024 * 1024).parse(xml); feedSchema.parse(feed);
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("RSS_INVALID_XML");
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true,
    updateTag: (name) => ["encoded", "content", "author", "creator"].includes(name) ? false : name });
  const root = object.parse(parser.parse(xml) as unknown);
  const rss = root.rss ? object.parse(root.rss) : null;
  const value = rss ? rss.channel : root.feed;
  const channel = value === "" ? {} : value === undefined ? null : object.parse(value);
  if (!channel) throw new Error("RSS_INVALID_XML");
  const entries = list(rss ? channel.item : channel.entry);
  if (entries.length > 500) throw new Error("RESULT_LIMIT_EXCEEDED");
  return entries.flatMap((raw) => {
    const result = object.safeParse(raw); if (!result.success) return [null];
    const item = result.data;
    const link = rss ? text(item.link) : list(item.link).flatMap((l) => {
      const parsed = object.safeParse(l);
      return parsed.success && (!parsed.data["@_rel"] || parsed.data["@_rel"] === "alternate") ? [text(parsed.data["@_href"])] : [];
    })[0] ?? "";
    const date = text(item.pubDate ?? item.published ?? item.date);
    // Require an explicit timestamp/zone. Missing dates never become poll time.
    const publishedAt = parseFeedDate(date); if (!publishedAt) return [null];
    const title = cleanText(text(item.title)).slice(0, 300);
    const excerpt = cleanText(text(item.description ?? item.summary)).slice(0, 600) || title;
    const row = entrySchema.safeParse({ title, url: link, publishedAt, excerpt, publisherName: feed.name });
    return row.success && (feed.localOnly || detectBengaluru(`${title} ${excerpt}`)) ? [row.data] : [null];
  }).slice(0, 50);
}

export function createRssAdapter(transport: Transport = fetchJson, options: AdapterOptions & { feeds?: Feed[] } = {}) {
  const selected = z.array(feedSchema).min(1).max(5).parse(options.feeds ?? feeds);
  const policies = new Map<string, string>();
  const guarded: Transport = async (url, request) => {
    const feed = selected.find((f) => f.url === url); if (!feed) throw new Error("RSS_UNKNOWN_FEED");
    const origin = new URL(url).origin;
    const init = { headers: { "User-Agent": RSS_USER_AGENT } };
    if (!policies.has(origin)) {
      let robots: unknown;
      try { robots = await transport(origin + "/robots.txt", { ...request, responseFormat: "text", init }); }
      catch (error) { if (!(error instanceof Error) || error.message !== "HTTP_404") throw new Error("RSS_ROBOTS_UNAVAILABLE"); robots = ""; }
      policies.set(origin, z.string().max(512000).parse(robots));
    }
    const policy = robotsPolicy(policies.get(origin)!, url);
    if (!policy.allowed) throw new Error("RSS_ROBOTS_DISALLOWED");
    if (policy.crawlDelayMs > 10000) throw new Error("RSS_CRAWL_DELAY_EXCEEDS_BUDGET");
    const xml = await transport(url, { ...request, minIntervalMs: policy.crawlDelayMs, responseFormat: "text", init });
    return parseFeedXml(z.string().parse(xml), feed);
  };
  const collect = collectSource({ source: "rss", concurrency: 1, minIntervalMs: 1000,
    queries: () => selected.map((feed) => ({ id: feed.id, url: feed.url, limit: 50 })),
    records: (payload) => z.array(z.unknown()).parse(payload), normalize: (raw, now) => {
      const parsed = entrySchema.safeParse(raw); if (!parsed.success) return null;
      const row = parsed.data;
      return normalize({ source: "rss", sourceId: row.url, url: row.url, title: row.title, text: row.excerpt,
        publishedAt: row.publishedAt, publisherName: row.publisherName }, now);
    } }, guarded, options);
  return async (...args: Parameters<typeof collect>) => { policies.clear(); return collect(...args); };
}
