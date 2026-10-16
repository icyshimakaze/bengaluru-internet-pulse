import "server-only";
import { z } from "zod";
import { enrichmentProviderSchema } from "@/lib/domain/enrichment-providers";

const blankToUndefined = (v: unknown) => typeof v === "string" && !v.trim() ? undefined : v;
const optional = z.preprocess(blankToUndefined, z.string().optional());
const withDefault = (value: string) => z.preprocess(blankToUndefined, z.string().default(value));
export const ingestionVariableNames = ["CRON_SECRET", "OPENAI_API_KEY", "OPENAI_MODEL", "XKIRO_API_KEY", "XKIRO_BASE_URL", "XKIRO_MODEL",
  "ENRICHMENT_PROVIDER", "ENRICHMENT_ENABLED", "AI_BATCH_SIZE", "MAX_AI_ITEMS_PER_RUN", "SOURCE_TIMEOUT_MS"] as const;
type IngestionVariable = (typeof ingestionVariableNames)[number];
export class IngestionEnvironmentError extends Error {
  constructor(readonly fields: IngestionVariable[], messages: string[] = []) {
    super(`Invalid ingestion environment: ${fields.join(", ")}. ${messages.join("; ")}`);
    this.name = "IngestionEnvironmentError";
  }
}
// Evaluated only by explicitly invoked ingestion/enrichment, never by web reads.
const schema = z.object({
  CRON_SECRET: optional.refine((v) => !v || v.length >= 32, "CRON_SECRET must be at least 32 characters"),
  // Only the selected provider validates its key/model/URL at construction.
  // Missing credentials retain the existing genuine heuristic fallback.
  OPENAI_API_KEY: optional, OPENAI_MODEL: withDefault("gpt-6-luna"),
  XKIRO_API_KEY: optional, XKIRO_BASE_URL: withDefault("https://api.xkiro.com/v1"), XKIRO_MODEL: optional,
  ENRICHMENT_PROVIDER: z.preprocess(blankToUndefined, enrichmentProviderSchema.default("heuristic")),
  ENRICHMENT_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  AI_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(10),
  MAX_AI_ITEMS_PER_RUN: z.coerce.number().int().min(1).max(30).default(30),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(8000),
});

export function parseIngestionEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) throw new IngestionEnvironmentError([...new Set(result.error.issues.flatMap((issue) =>
    ingestionVariableNames.filter((name) => name === issue.path[0])))], result.error.issues.map((issue) => issue.message));
  return result.data;
}
export function getIngestionEnv() { return parseIngestionEnv(process.env); }
export type IngestionEnv = ReturnType<typeof parseIngestionEnv>;
