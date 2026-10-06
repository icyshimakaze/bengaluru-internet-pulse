import "server-only";
import { z } from "zod";

const optional = z.preprocess((v) => v === "" ? undefined : v, z.string().optional());
const schema = z.object({
  APP_DATA_MODE: z.enum(["demo", "live"]).default("demo"),
  TURSO_DATABASE_URL: optional.refine((v) => !v || /^(libsql:\/\/|https:\/\/|file:)/.test(v), "Use a libSQL, HTTPS or local file URL"),
  TURSO_AUTH_TOKEN: optional, CRON_SECRET: optional.refine((v) => !v || v.length >= 32, "CRON_SECRET must be at least 32 characters"),
  AI_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  OPENAI_API_KEY: optional, OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(8000),
}).superRefine((v, ctx) => {
  if (v.AI_ENABLED && !v.OPENAI_API_KEY) ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "AI_ENABLED requires an API key" });
  if (v.TURSO_DATABASE_URL && !v.TURSO_DATABASE_URL.startsWith("file:") && !v.TURSO_AUTH_TOKEN) ctx.addIssue({ code: "custom", path: ["TURSO_AUTH_TOKEN"], message: "Remote databases require a token" });
  if (process.env.VERCEL && v.TURSO_DATABASE_URL?.startsWith("file:")) ctx.addIssue({ code: "custom", path: ["TURSO_DATABASE_URL"], message: "Vercel requires a persistent remote database" });
});

export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return result.data;
}
export function getEnv() { return parseEnv(process.env); }
