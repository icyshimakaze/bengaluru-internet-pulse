import "server-only";
import { z } from "zod";

const blankToUndefined = (v: unknown) => typeof v === "string" && !v.trim() ? undefined : v;
const optional = z.preprocess(blankToUndefined, z.string().optional());
// Web reads validate only data mode and database configuration.
const schema = z.object({
  VERCEL: optional,
  APP_DATA_MODE: z.preprocess(blankToUndefined, z.enum(["demo", "live"]).optional()),
  TURSO_DATABASE_URL: optional.refine((v) => {
    if (!v || v.startsWith("file:")) return true;
    try {
      const url = new URL(v);
      return ["libsql:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
    } catch { return false; }
  }, "Use a libSQL, HTTPS or local file URL"),
  TURSO_AUTH_TOKEN: optional,
}).superRefine((v, ctx) => {
  if (v.TURSO_DATABASE_URL && !v.TURSO_DATABASE_URL.startsWith("file:") && !v.TURSO_AUTH_TOKEN) ctx.addIssue({ code: "custom", path: ["TURSO_AUTH_TOKEN"], message: "Remote databases require a token" });
  if (v.VERCEL && v.TURSO_DATABASE_URL?.startsWith("file:")) ctx.addIssue({ code: "custom", path: ["TURSO_DATABASE_URL"], message: "Vercel requires a persistent remote database" });
}).transform(({ VERCEL, ...env }) => ({
  ...env, APP_DATA_MODE: env.APP_DATA_MODE ?? (VERCEL || env.TURSO_DATABASE_URL ? "live" as const : "demo" as const),
}));

export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return result.data;
}
export function getEnv() { return parseEnv(process.env); }
export type ServerEnv = ReturnType<typeof parseEnv>;
