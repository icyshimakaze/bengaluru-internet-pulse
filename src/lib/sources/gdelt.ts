import "server-only";
import { z } from "zod";
import { httpUrlSchema } from "@/lib/domain/schema";
import { normalize, canonicalUrl } from "@/lib/pipeline/normalize";
import { collectSource, type SourceQuery } from "./collector";
import { fetchJson, type Transport } from "./http";
import type { AdapterOptions } from "./types";

const envelope = z.object({ articles: z.array(z.unknown()) });
const articleSchema = z.object({ url: httpUrlSchema, title: z.string().max(20000), seendate: z.string().regex(/^\d{8}T\d{6}Z$/) });
const searches = [
  ["city", "(Bengaluru OR Bangalore)", 100],
  ["mobility", "(Bengaluru OR Bangalore) (metro OR traffic OR road OR airport)", 50],
  ["technology", "(Bengaluru OR Bangalore) (startup OR AI OR technology OR software)", 50],
  ["culture", "(Bengaluru OR Bangalore) (food OR event OR culture)", 50],
  ["weather", "(Bengaluru OR Bangalore) (rain OR weather OR flooding)", 50],
] as const;
const compact = (date: Date) => date.toISOString().replace(/[-:TZ]/g, "").slice(0, 14);
export function gdeltQueries(now: Date): SourceQuery[] {
  return searches.map(([id, query, limit]) => ({ id, limit, url: "https://api.gdeltproject.org/api/v2/doc/doc?" + new URLSearchParams({
    query, mode: "artlist", format: "json", sort: "datedesc", maxrecords: String(limit),
    startdatetime: compact(new Date(now.getTime() - 86400000)), enddatetime: compact(now),
  }) }));
}
export function createGdeltAdapter(transport: Transport = fetchJson, options: AdapterOptions = {}) {
  return collectSource({ source: "gdelt", concurrency: 1, minIntervalMs: 5500, queries: gdeltQueries, records: (payload) => envelope.parse(payload).articles,
    normalize: (record, now) => {
      const parsed = articleSchema.safeParse(record);
      if (!parsed.success) return null;
      const d = parsed.data;
      try {
        return normalize({ source: "gdelt", sourceId: canonicalUrl(d.url), url: d.url, title: d.title,
          publishedAt: d.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"), timeKind: "discovered" }, now);
      } catch { return null; }
    },
  }, transport, options);
}
