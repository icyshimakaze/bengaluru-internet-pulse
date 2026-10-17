import { z } from "zod";
import { sourceSchema, neighborhoodSchema } from "@/lib/domain/schema";
import { semanticCategories, semanticCategorySchema } from "@/lib/domain/enrichment";
import { languages } from "@/lib/domain/language";
import { parseCsv } from "./csv";

export const labelColumns = ["id", "source", "language", "text", "true_event_group", "true_neighborhood", "true_category", "is_spam_or_bot"] as const;
const neighborhoodLabel = z.union([neighborhoodSchema, z.literal("none")]);
export const labelSchema = z.object({ id: z.string().min(1), source: sourceSchema, language: z.enum(languages), text: z.string().min(1).max(5000),
  true_event_group: z.string().trim().min(1).max(100), true_neighborhood: neighborhoodLabel,
  true_category: semanticCategorySchema, is_spam_or_bot: z.enum(["true", "false"]).transform((v) => v === "true") }).strict();
export type Label = z.infer<typeof labelSchema>;
export const predictionSchema = z.object({ id: z.string().min(1), source: sourceSchema, language: z.enum(languages), textHash: z.string().regex(/^[a-f0-9]{64}$/u),
  eventGroup: z.string().min(1), neighborhood: neighborhoodSchema.nullable(), category: semanticCategorySchema.nullable(), filtered: z.boolean() }).strict();
export type Prediction = z.infer<typeof predictionSchema>;
export const manifestSchema = z.object({ kind: z.enum(["live", "synthetic"]), exportedAt: z.iso.datetime(),
  commit: z.string().regex(/^[a-f0-9]{40,64}$/u), dirty: z.boolean(), filterRuleVersion: z.literal(1),
  note: z.string().min(1).max(240).optional(), observationStart: z.iso.datetime().nullable().optional(), observationEnd: z.iso.datetime().nullable().optional(),
  requestedSize: z.number().int().min(1).max(5000), predictions: z.array(predictionSchema).max(5000) }).strict();

export function readLabels(text: string): Label[] {
  if (text.length > 30_000_000) throw new Error("LABEL_FILE_TOO_LARGE");
  const [header, ...rows] = parseCsv(text);
  if (!header || header.join("|") !== labelColumns.join("|")) throw new Error("LABEL_HEADER_INVALID");
  const labels = z.array(labelSchema).min(1).max(5000).parse(rows.map((row) => {
    if (row.length !== labelColumns.length) throw new Error("LABEL_ROW_INVALID");
    return Object.fromEntries(labelColumns.map((column, index) => [column, row[index]]));
  }));
  if (new Set(labels.map((row) => row.id)).size !== labels.length) throw new Error("LABEL_DUPLICATE_ID");
  return labels;
}
const ratio = (a: number, b: number): number | null => b ? a / b : null;
function prf(tp: number, fp: number, fn: number) {
  return { tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn) };
}
export function evaluateLabels(labels: readonly Label[], predictions: readonly Prediction[]) {
  if (!labels.length || new Set(predictions.map((p) => p.id)).size !== predictions.length) throw new Error("PREDICTION_IDS_INVALID");
  const byId = new Map(predictions.map((p) => [p.id, p]));
  if (byId.size !== labels.length || labels.some((row) => !byId.has(row.id))) throw new Error("PREDICTION_IDS_INVALID");
  const rows = labels.map((truth) => ({ truth, prediction: byId.get(truth.id)! }));
  const spam = prf(rows.filter((r) => r.prediction.filtered && r.truth.is_spam_or_bot).length,
    rows.filter((r) => r.prediction.filtered && !r.truth.is_spam_or_bot).length,
    rows.filter((r) => !r.prediction.filtered && r.truth.is_spam_or_bot).length);
  const locatedCorrect = rows.filter((r) => r.prediction.neighborhood !== null && r.prediction.neighborhood === r.truth.true_neighborhood).length;
  const location = prf(locatedCorrect, rows.filter((r) => r.prediction.neighborhood !== null).length - locatedCorrect,
    rows.filter((r) => r.truth.true_neighborhood !== "none").length - locatedCorrect);
  const category = { accuracy: rows.filter((r) => r.prediction.category === r.truth.true_category).length / rows.length,
    unclassified: rows.filter((r) => r.prediction.category === null).length,
    classes: semanticCategories.map((name) => ({ name, support: rows.filter((r) => r.truth.true_category === name).length,
      ...prf(rows.filter((r) => r.prediction.category === name && r.truth.true_category === name).length,
        rows.filter((r) => r.prediction.category === name && r.truth.true_category !== name).length,
        rows.filter((r) => r.prediction.category !== name && r.truth.true_category === name).length) })) };
  const eventRows = rows.filter((r) => !r.truth.is_spam_or_bot);
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < eventRows.length; i++) for (let j = i + 1; j < eventRows.length; j++) {
    const a = eventRows[i]!, b = eventRows[j]!;
    const gold = a.truth.true_event_group === b.truth.true_event_group, predicted = a.prediction.eventGroup === b.prediction.eventGroup;
    if (gold && predicted) tp++; else if (predicted) fp++; else if (gold) fn++;
  }
  return { sampleSize: labels.length, spam, location, category, clustering: { ...prf(tp, fp, fn), items: eventRows.length } };
}
export type Evaluation = ReturnType<typeof evaluateLabels>;
const percent = (value: number | null) => value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
export function resultTable(result: Evaluation): string {
  return ["| Measure | Precision | Recall | F1 / accuracy |", "| --- | ---: | ---: | ---: |",
    `| Spam/bot filter | ${percent(result.spam.precision)} | ${percent(result.spam.recall)} | ${percent(result.spam.f1)} |`,
    `| Neighborhood extraction | ${percent(result.location.precision)} | ${percent(result.location.recall)} | ${percent(result.location.f1)} |`,
    `| Category classification | — | — | ${percent(result.category.accuracy)} accuracy |`,
    `| Event clustering (pairwise) | ${percent(result.clustering.precision)} | ${percent(result.clustering.recall)} | ${percent(result.clustering.f1)} |`].join("\n");
}
export function evaluationMarkdown(result: Evaluation, metadata: { date: string; commit: string; synthetic: boolean; sampleCommit: string; dirty: boolean }) {
  return `${metadata.synthetic ? "**SYNTHETIC FIXTURE — software test only; never project accuracy.**\n\n" : ""}Sample size: ${result.sampleSize}. Evaluated: ${metadata.date} (Asia/Kolkata). Commit: \`${metadata.commit}\`.\n\nSample/export commit: \`${metadata.sampleCommit}\`${metadata.dirty ? " (working tree had changes)" : ""}. Filter rule version: 1.\n\n${resultTable(result)}\n\n${result.category.unclassified} unclassified predictions count as incorrect categories. Clustering uses ${result.clustering.items} human-labeled non-spam items. Zero denominators are N/A.\n\n| Category | Support | Precision | Recall | F1 |\n| --- | ---: | ---: | ---: | ---: |\n${result.category.classes.map((c) => `| ${c.name} | ${c.support} | ${percent(c.precision)} | ${percent(c.recall)} | ${percent(c.f1)} |`).join("\n")}\n`;
}
