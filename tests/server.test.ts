import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/server/env";
import { parseIngestionEnv } from "@/lib/server/ingestion-env";
import { authorized } from "@/lib/server/auth";
import { ageSnapshot, emptyPulse } from "@/lib/server/read";
import { now, pulse } from "./helpers";
import { HOUR } from "@/lib/trends/engine";
describe("configuration and read safety", () => {
  it("defaults to explicitly labeled demo and validates server credentials", () => {
    expect(parseEnv({}).APP_DATA_MODE).toBe("demo");
    expect(() => parseEnv({ TURSO_DATABASE_URL: "libsql://example.turso.io" })).toThrow("token");
    expect(() => parseEnv({ TURSO_DATABASE_URL: "https://" })).toThrow("TURSO_DATABASE_URL");
    expect(() => parseEnv({ APP_DATA_MODE: "invalid" })).toThrow("APP_DATA_MODE");
    expect(() => parseEnv({ VERCEL: "1", TURSO_DATABASE_URL: "file:.data/pulse.db" })).toThrow("persistent remote");
  });
  it("requires only database settings for live Vercel reads and preserves explicit demo deployments", () => {
    const input = { VERCEL: "1", TURSO_DATABASE_URL: "libsql://example.turso.io", TURSO_AUTH_TOKEN: "PRIVATE_DB_TOKEN" };
    expect(parseEnv(input)).toEqual({ APP_DATA_MODE: "live", TURSO_DATABASE_URL: input.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: input.TURSO_AUTH_TOKEN });
    expect(parseEnv({ ...input, APP_DATA_MODE: "demo" }).APP_DATA_MODE).toBe("demo");
    expect(parseEnv({ VERCEL: "1" }).APP_DATA_MODE).toBe("live");
    expect(parseEnv({ TURSO_DATABASE_URL: input.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: input.TURSO_AUTH_TOKEN }).APP_DATA_MODE).toBe("live");
  });
  it("ignores worker settings in the web configuration, including invalid or populated secrets", () => {
    const env = parseEnv({ VERCEL: "1", ENRICHMENT_PROVIDER: "invalid", AI_BATCH_SIZE: "invalid",
      MAX_AI_ITEMS_PER_RUN: "999", ENRICHMENT_ENABLED: "invalid", SOURCE_TIMEOUT_MS: "0", CRON_SECRET: "short",
      OPENAI_API_KEY: "PRIVATE_AI_KEY", XKIRO_API_KEY: "PRIVATE_AI_KEY", OPENAI_MODEL: "invalid model", XKIRO_MODEL: "invalid model" });
    expect(env).toEqual({ APP_DATA_MODE: "live" });
    expect(JSON.stringify(env)).not.toContain("PRIVATE_AI_KEY");
  });
  it("validates worker limits and provider names only in ingestion configuration", () => {
    expect(parseIngestionEnv({ AI_ENABLED: "true" }).ENRICHMENT_PROVIDER).toBe("heuristic");
    expect(() => parseIngestionEnv({ AI_BATCH_SIZE: "11" })).toThrow("AI_BATCH_SIZE");
    expect(() => parseIngestionEnv({ MAX_AI_ITEMS_PER_RUN: "31" })).toThrow("MAX_AI_ITEMS_PER_RUN");
    expect(() => parseIngestionEnv({ ENRICHMENT_PROVIDER: "invalid" })).toThrow("ENRICHMENT_PROVIDER");
    expect(() => parseIngestionEnv({ CRON_SECRET: "short" })).toThrow("32 characters");
    expect(() => parseIngestionEnv({ SOURCE_TIMEOUT_MS: "0" })).toThrow("SOURCE_TIMEOUT_MS");
    expect(parseIngestionEnv({ OPENAI_MODEL: "different-model" }).OPENAI_MODEL).toBe("different-model");
  });
  it.each(["openai", "xkiro", "heuristic"])("allows %s builds without either provider's credentials", (provider) => {
    const env = parseIngestionEnv({ ENRICHMENT_PROVIDER: provider, OPENAI_API_KEY: "", XKIRO_API_KEY: "",
      OPENAI_MODEL: "", XKIRO_BASE_URL: "", XKIRO_MODEL: "" });
    expect(env.ENRICHMENT_PROVIDER).toBe(provider);
    expect(env.OPENAI_API_KEY).toBeUndefined(); expect(env.XKIRO_API_KEY).toBeUndefined();
    expect(env.OPENAI_MODEL).toBe("gpt-6-luna"); expect(env.XKIRO_BASE_URL).toBe("https://api.xkiro.com/v1");
    expect(env.XKIRO_MODEL).toBeUndefined();
  });
  it("treats blank repository variables as absent while rejecting unknown provider names", () => {
    expect(parseIngestionEnv({ ENRICHMENT_PROVIDER: "", OPENAI_MODEL: " ", XKIRO_BASE_URL: "\t" })).toMatchObject({
      ENRICHMENT_PROVIDER: "heuristic", OPENAI_MODEL: "gpt-6-luna", XKIRO_BASE_URL: "https://api.xkiro.com/v1" });
    expect(() => parseIngestionEnv({ ENRICHMENT_PROVIDER: "unknown" })).toThrow("ENRICHMENT_PROVIDER");
  });
  it("rejects missing and incorrect bearer tokens", () => {
    const secret = "a".repeat(32);
    expect(authorized(null, secret)).toBe(false); expect(authorized("Bearer wrong", secret)).toBe(false);
    expect(authorized(`Bearer ${secret}`, undefined)).toBe(false);
    expect(authorized(`Bearer ${secret}`, secret)).toBe(true);
  });
  it("ages stale evidence without manufacturing fresh collection times", () => {
    const snapshot = pulse();
    const aged = ageSnapshot(snapshot, new Date(now.getTime() + 4 * HOUR));
    expect(aged.stale).toBe(true); expect(aged.status).toBe("degraded");
    expect(aged.generatedAt).toBe(snapshot.generatedAt); expect(aged.trends).toEqual([]); expect(aged.hotspots).toEqual([]);
  });
  it("does not invent a collection timestamp when no snapshot exists", () => {
    expect(emptyPulse(now, "Not configured").generatedAt).toBeNull();
  });
});
