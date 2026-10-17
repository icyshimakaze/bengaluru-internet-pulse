import "server-only";
import { z } from "zod";
import { httpUrlSchema } from "@/lib/domain/schema";
import { normalize } from "@/lib/pipeline/normalize";
import { collectSource, type SourceQuery } from "./collector";
import { fetchJson, type Transport } from "./http";
import type { AdapterOptions } from "./types";

const envelope = z.object({ hits: z.array(z.unknown()) });
const storySchema = z.object({ objectID: z.string().regex(/^\d+$/), title: z.string().max(20000),
  url: httpUrlSchema.nullable().optional(), story_text: z.string().max(100000).nullable().optional(), created_at: z.iso.datetime({ offset: true }) });
const commentSchema = z.object({ objectID: z.string().regex(/^\d+$/), _tags: z.array(z.string()).refine((tags) => tags.includes("comment")),
  story_title: z.string().min(3).max(20000), comment_text: z.string().min(3).max(100000), created_at: z.iso.datetime({ offset: true }) });
export function hackerNewsQueries(now: Date): SourceQuery[] {
  return ["Bengaluru", "Bangalore"].map((query) => ({ id: query.toLowerCase(), limit: 50,
    url: "https://hn.algolia.com/api/v1/search_by_date?" + new URLSearchParams({ query, tags: "(story,comment)", hitsPerPage: "50",
      numericFilters: `created_at_i>=${Math.floor((now.getTime() - 86400000) / 1000)},created_at_i<=${Math.floor(now.getTime() / 1000)}` }) }));
}
export function createHackerNewsAdapter(transport: Transport = fetchJson, options: AdapterOptions = {}) {
  return collectSource({ source: "hackernews", queries: hackerNewsQueries, records: (payload) => envelope.parse(payload).hits,
    normalize: (record, now) => {
      const parsed = storySchema.safeParse(record), comment = commentSchema.safeParse(record);
      if (!parsed.success && !comment.success) return null;
      if (comment.success) {
        const d = comment.data;
        return normalize({ source: "hackernews", sourceId: d.objectID, url: `https://news.ycombinator.com/item?id=${d.objectID}`,
          title: `Discussion: ${d.story_title}`, text: d.comment_text, publishedAt: d.created_at }, now);
      }
      if (!parsed.success) return null;
      const d = parsed.data;
      return normalize({ source: "hackernews", sourceId: d.objectID, url: `https://news.ycombinator.com/item?id=${d.objectID}`,
        contentUrl: d.url ?? undefined, title: d.title, text: d.story_text ?? undefined, publishedAt: d.created_at }, now);
    },
  }, transport, options);
}
