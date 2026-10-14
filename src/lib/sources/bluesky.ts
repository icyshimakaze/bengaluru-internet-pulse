import "server-only";
import { z } from "zod";
import { httpUrlSchema } from "@/lib/domain/schema";
import { normalize } from "@/lib/pipeline/normalize";
import { collectSource, type SourceQuery } from "./collector";
import { fetchJson, type Transport } from "./http";
import type { AdapterOptions } from "./types";

const envelope = z.object({ posts: z.array(z.unknown()) });
const postSchema = z.object({
  uri: z.string().regex(/^at:\/\/(did:[a-z0-9]+:[a-zA-Z0-9._%:-]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9_-]+)$/),
  record: z.object({ text: z.string().max(20000), createdAt: z.iso.datetime({ offset: true }) }),
  embed: z.unknown().optional(),
});
const externalSchema = z.object({ external: z.object({ uri: httpUrlSchema }) });
const recordMediaSchema = z.object({ media: externalSchema });
export function blueskyQueries(now: Date): SourceQuery[] {
  // Search is unavailable on the cached public host (403); the official AppView
  // serves this public query without account credentials.
  return ["Bengaluru", "Bangalore", "Namma Metro", "ಬೆಂಗಳೂರು"].map((q, i) => ({ id: "search-" + i, limit: 50,
    url: "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?" + new URLSearchParams({ q, sort: "latest", limit: "50",
      since: new Date(now.getTime() - 86400000).toISOString(), until: now.toISOString() }) }));
}
export function createBlueskyAdapter(transport: Transport = fetchJson, options: AdapterOptions = {}) {
  return collectSource({ source: "bluesky", queries: blueskyQueries, records: (payload) => envelope.parse(payload).posts,
    normalize: (record, now) => {
      const parsed = postSchema.safeParse(record);
      if (!parsed.success) return null;
      const d = parsed.data, match = d.uri.match(/^at:\/\/(.+)\/app\.bsky\.feed\.post\/(.+)$/)!;
      const external = externalSchema.safeParse(d.embed), media = recordMediaSchema.safeParse(d.embed);
      const contentUrl = external.success ? external.data.external.uri : media.success ? media.data.media.external.uri : undefined;
      return normalize({ source: "bluesky", sourceId: d.uri, url: `https://bsky.app/profile/${match[1]}/post/${match[2]}`,
        contentUrl, title: d.record.text, text: d.record.text, publishedAt: d.record.createdAt }, now);
    },
  }, transport, options);
}
