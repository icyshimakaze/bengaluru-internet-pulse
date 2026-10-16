import "server-only";
import { z } from "zod";
import { httpUrlSchema } from "@/lib/domain/urls";

const blankToUndefined = (v: unknown) => typeof v === "string" && !v.trim() ? undefined : v;
export const publicSiteOriginSchema = httpUrlSchema.refine((value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/, "");
    const local = ["localhost", "0.0.0.0", "[::]", "[::1]"].includes(host) || host.endsWith(".localhost") || host.endsWith(".local")
      || /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && !local;
  } catch { return false; }
}, "Use a public HTTPS origin without credentials, path, query or fragment");
const siteUrlSchema = z.preprocess(blankToUndefined, publicSiteOriginSchema.optional());
const schema = z.object({ SITE_URL: siteUrlSchema });
export function siteSettings(input: Record<string, string | undefined> = process.env) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error("Invalid environment: SITE_URL must be a public HTTPS origin without credentials, path, query or fragment");
  return result.data;
}

const indexingSchema = z.object({ NODE_ENV: z.enum(["production", "development", "test"]).optional(),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  APP_DATA_MODE: z.preprocess(blankToUndefined, z.enum(["demo", "live"]).optional()),
  VERCEL: z.string().optional(), TURSO_DATABASE_URL: z.string().optional() });
export function indexingAllowed(input: Record<string, string | undefined> = process.env): boolean {
  const parsed = indexingSchema.safeParse(input);
  if (!parsed.success) return false;
  const env = parsed.data;
  const live = env.APP_DATA_MODE ? env.APP_DATA_MODE === "live" : !!(env.VERCEL || env.TURSO_DATABASE_URL?.trim());
  return env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview" && env.VERCEL_ENV !== "development" && live;
}
