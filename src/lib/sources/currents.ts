import "server-only";
import { z } from "zod";
import { httpUrlSchema } from "@/lib/domain/schema";
import { normalize } from "@/lib/pipeline/normalize";
import { collectSource, type SourceQuery } from "./collector";
import { fetchJson, type Transport } from "./http";
import type { AdapterOptions } from "./types";

const envelope = z.object({ status: z.literal("ok"), news: z.array(z.unknown()) });
const article = z.object({ id: z.string().min(1).max(2048), title: z.string().max(20000),
  description: z.string().max(50000).nullish(), url: httpUrlSchema, published: z.string().max(100) });

export function currentsQueries(now: Date): SourceQuery[] {
  return [{ id: "city", limit: 20, url: "https://api.currentsapi.services/v2/search?" + new URLSearchParams({
    query: "Bengaluru OR Bangalore", language: "en", page_size: "20", page_number: "1",
    start_date: new Date(now.getTime() - 86400000).toISOString(), end_date: now.toISOString(),
  }) }];
}

// Currents also returns `YYYY-MM-DD HH:mm:ss +0000`. Require an explicit
// offset, validate the calendar before conversion, and never use the poll time.
export function currentsPublishedAt(value: string): string | null {
  const iso = value.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/, "$1T$2$3:$4");
  const parsed = z.iso.datetime({ offset: true }).safeParse(iso);
  if (!parsed.success) return null;
  const timestamp = Date.parse(parsed.data);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function createCurrentsAdapter(key: string | undefined, transport: Transport = fetchJson, options: AdapterOptions = {}) {
  const authenticated: Transport = (url, request) => {
    if (!key) throw new Error("CURRENTS_KEY_MISSING");
    if (new URL(url).origin !== "https://api.currentsapi.services") throw new Error("CURRENTS_INVALID_ORIGIN");
    return transport(url, { ...request, init: { headers: { Authorization: `Bearer ${key}` } } });
  };
  return collectSource({ source: "currents", concurrency: 1, queries: currentsQueries,
    records: (payload) => envelope.parse(payload).news,
    normalize: (record, now) => {
      const parsed = article.safeParse(record);
      if (!parsed.success) return null;
      const d = parsed.data, publishedAt = currentsPublishedAt(d.published);
      return publishedAt ? normalize({ source: "currents", sourceId: d.id, url: d.url, title: d.title,
        text: d.description ?? undefined, publishedAt, timeKind: "published" }, now) : null;
    },
  }, authenticated, options);
}
