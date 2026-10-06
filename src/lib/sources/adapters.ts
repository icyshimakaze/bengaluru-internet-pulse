import "server-only";
import { z } from "zod";
import { type Signal, type Source, type SourceStatus } from "@/lib/domain/schema";
import { normalize } from "@/lib/pipeline/normalize";
import { fetchJson } from "./http";
import { errorCode, log } from "@/lib/server/logger";

const envelope = (key: string) => z.object({ [key]: z.array(z.unknown()) });
const gdeltItem = z.object({ url: z.url(), title: z.string(), seendate: z.string().regex(/^\d{8}T\d{6}Z$/) });
const bskyItem = z.object({
  uri: z.string().regex(/^at:\/\/did:[^/]+\/app\.bsky\.feed\.post\/[^/]+$/),
  record: z.object({ text: z.string(), createdAt: z.iso.datetime({ offset: true }) }),
  embed: z.object({ external: z.object({ uri: z.url() }).optional() }).optional(),
});
const hnItem = z.object({ objectID: z.string(), title: z.string(), url: z.url().nullable().optional(), created_at: z.iso.datetime({ offset: true }) });
export type SourceResult = { signals: Signal[]; health: SourceStatus };
export type SourceAdapter = (now: Date, timeoutMs: number) => Promise<SourceResult>;
type Transport = (url: string, options?: { timeoutMs?: number }) => Promise<unknown>;

export function createAdapters(transport: Transport = fetchJson): Record<Source, SourceAdapter> {
  async function collect(source: Source, now: Date, timeoutMs: number): Promise<SourceResult> {
    const start = Date.now();
    try {
      let raw: unknown[] = [];
      if (source === "gdelt") {
        const params = new URLSearchParams({ query: "(Bengaluru OR Bangalore)", mode: "artlist", format: "json", sort: "datedesc", timespan: "24h", maxrecords: "250" });
        const data = envelope("articles").parse(await transport(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { timeoutMs }));
        raw = data.articles ?? [];
      } else {
        const payloads = await Promise.all(["Bengaluru", "Bangalore"].map(async (query) => {
          const params = source === "bluesky"
            ? new URLSearchParams({ q: query, sort: "latest", limit: "100", since: new Date(now.getTime() - 86400000).toISOString() })
            : new URLSearchParams({ query, tags: "story", hitsPerPage: "100", numericFilters: `created_at_i>${Math.floor((now.getTime() - 86400000) / 1000)}` });
          const endpoint = source === "bluesky" ? "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts" : "https://hn.algolia.com/api/v1/search_by_date";
          const key = source === "bluesky" ? "posts" : "hits";
          return envelope(key).parse(await transport(`${endpoint}?${params}`, { timeoutMs }))[key] ?? [];
        }));
        raw = payloads.flat();
      }
      const signals: Signal[] = [];
      for (const item of raw) {
        let signal: Signal | null = null;
        if (source === "gdelt") {
          const result = gdeltItem.safeParse(item);
          if (result.success) {
            const d = result.data;
            const iso = d.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
            signal = normalize({ source, sourceId: d.url, url: d.url, title: d.title, publishedAt: iso, timeKind: "discovered" }, now);
          }
        } else if (source === "bluesky") {
          const result = bskyItem.safeParse(item);
          if (result.success) {
            const d = result.data;
            const [did, rkey] = d.uri.slice(5).split("/app.bsky.feed.post/");
            const external = d.embed?.external?.uri;
            signal = normalize({ source, sourceId: d.uri, url: `https://bsky.app/profile/${did}/post/${rkey}`, contentUrl: external && /^https?:\/\//.test(external) ? external : undefined, title: d.record.text, text: d.record.text, publishedAt: d.record.createdAt }, now);
          }
        } else {
          const result = hnItem.safeParse(item);
          if (result.success) { const d = result.data; signal = normalize({ source, sourceId: d.objectID, url: d.url ?? `https://news.ycombinator.com/item?id=${d.objectID}`, title: d.title, publishedAt: d.created_at }, now); }
        }
        if (signal) signals.push(signal);
      }
      const health: SourceStatus = { source, status: "ok", fetched: raw.length, accepted: signals.length, rejected: raw.length - signals.length, durationMs: Date.now() - start, checkedAt: now.toISOString() };
      log("info", "source.completed", { source, fetched: raw.length, accepted: signals.length, durationMs: health.durationMs });
      return { signals, health };
    } catch (error) {
      const code = errorCode(error);
      log("warn", "source.failed", { source, code, durationMs: Date.now() - start });
      return { signals: [], health: { source, status: "error", fetched: 0, accepted: 0, rejected: 0, durationMs: Date.now() - start, checkedAt: now.toISOString(), error: code } };
    }
  }
  return { gdelt: (now, timeout) => collect("gdelt", now, timeout), bluesky: (now, timeout) => collect("bluesky", now, timeout), hackernews: (now, timeout) => collect("hackernews", now, timeout) };
}
