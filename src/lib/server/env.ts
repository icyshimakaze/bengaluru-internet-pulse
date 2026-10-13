import "server-only";
import { z } from "zod";
import { enrichmentProviderSchema, modelIdSchema } from "@/lib/domain/enrichment-providers";

const optional = z.preprocess((v) => typeof v === "string" && !v.trim() ? undefined : v, z.string().optional());
const schema = z.object({
  APP_DATA_MODE: z.enum(["demo", "live"]).default("demo"),
  TURSO_DATABASE_URL: optional.refine((v) => !v || /^(libsql:\/\/|https:\/\/|file:)/.test(v), "Use a libSQL, HTTPS or local file URL"),
  TURSO_AUTH_TOKEN: optional, CRON_SECRET: optional.refine((v) => !v || v.length >= 32, "CRON_SECRET must be at least 32 characters"),
  OPENAI_API_KEY: optional, OPENAI_MODEL: z.preprocess((v) => v === "" ? undefined : v, modelIdSchema.default("gpt-6-luna")),
  XKIRO_API_KEY: optional,
  XKIRO_BASE_URL: z.preprocess((v) => v === "" ? undefined : v, z.url().refine((v) => {
    const url = new URL(v); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }, "XKIRO_BASE_URL must be HTTPS without credentials, query or fragment").default("https://api.xkiro.com/v1")),
  // Model/key requirements are checked only by the selected provider, allowing safe fallback.
  XKIRO_MODEL: optional,
  ENRICHMENT_PROVIDER: enrichmentProviderSchema.default("heuristic"),
  ENRICHMENT_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  AI_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(10),
  MAX_AI_ITEMS_PER_RUN: z.coerce.number().int().min(1).max(30).default(30),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(8000),
}).superRefine((v, ctx) => {
  // Missing LLM credentials are handled by the provider factory and heuristic fallback.
  if (v.TURSO_DATABASE_URL && !v.TURSO_DATABASE_URL.startsWith("file:") && !v.TURSO_AUTH_TOKEN) ctx.addIssue({ code: "custom", path: ["TURSO_AUTH_TOKEN"], message: "Remote databases require a token" });
  if (process.env.VERCEL && v.TURSO_DATABASE_URL?.startsWith("file:")) ctx.addIssue({ code: "custom", path: ["TURSO_DATABASE_URL"], message: "Vercel requires a persistent remote database" });
});

export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return result.data;
}
export function getEnv() { return parseEnv(process.env); }
export type ServerEnv = ReturnType<typeof parseEnv>;
