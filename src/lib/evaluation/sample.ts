import "server-only";
import { createHash } from "node:crypto";
import { detectLanguage } from "@/lib/domain/language";
import { semanticCategorySchema } from "@/lib/domain/enrichment";
import type { ItemRecord } from "@/lib/db/records";
import { filterSignal } from "@/lib/ingestion/filters.config";
import { labelColumns, predictionSchema } from "./metrics";
import { writeCsv } from "./csv";

export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export function redactIdentifiers(text: string): string {
  let safe = text.replace(/(?:https?:\/\/[^\s]+\/(?:profile|users?|in)\/[^\s]+|https?:\/\/[^\s]+\/@[^\s]+|https?:\/\/news\.ycombinator\.com\/user\?[^\s]+|at:\/\/[^\s]+)/giu, "[profile removed]")
    .replace(/\bdid:[^\s<>()]+/giu, "[DID removed]")
    .replace(/\b[a-z0-9_.-]+\.bsky\.social\b/giu, "[profile removed]")
    .replace(/[\p{L}\p{N}_.+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, "[email removed]")
    .replace(/@[\p{L}\p{M}\p{N}_.-]+/gu, "[handle removed]").trim();
  if (!safe) safe = "[profile identifiers removed]";
  // CSV quoting alone does not prevent spreadsheet formula interpretation.
  if (/^\s*[=+@-]/u.test(safe)) safe = "'" + safe;
  return safe;
}
export function sampleExport(items: Array<{ item: ItemRecord; category: unknown }>) {
  const rows = items.map(({ item, category }) => {
    const text = redactIdentifiers(`${item.title}\n${item.excerpt}`), id = digest(item.id), language = detectLanguage(text);
    const reason = item.filterReason ?? filterSignal(item);
    const prediction = predictionSchema.parse({ id, source: item.source, language, textHash: digest(text),
      eventGroup: digest(item.topicId ?? `singleton:${item.id}`), neighborhood: item.neighborhood,
      category: reason === "job_posting" ? "jobs" : category === null || category === undefined ? null : semanticCategorySchema.parse(category), filtered: reason !== null });
    return { csv: [id, item.source, language, text, "", "", "", ""], prediction };
  });
  return { csv: writeCsv([labelColumns, ...rows.map((row) => row.csv)]), predictions: rows.map((row) => row.prediction) };
}
