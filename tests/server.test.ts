import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/server/env";
import { authorized } from "@/lib/server/auth";
import { ageSnapshot, emptyPulse } from "@/lib/server/read";
import { now, pulse } from "./helpers";
import { HOUR } from "@/lib/trends/engine";
describe("configuration and read safety", () => {
  it("defaults to explicitly labeled demo and validates server credentials", () => {
    expect(parseEnv({}).APP_DATA_MODE).toBe("demo");
    expect(parseEnv({ AI_ENABLED: "true" }).ENRICHMENT_PROVIDER).toBe("heuristic");
    expect(parseEnv({ ENRICHMENT_PROVIDER: "openai" }).OPENAI_API_KEY).toBeUndefined();
    expect(parseEnv({}).OPENAI_MODEL).toBe("gpt-6-luna");
    expect(() => parseEnv({ AI_BATCH_SIZE: "11" })).toThrow();
    expect(() => parseEnv({ MAX_AI_ITEMS_PER_RUN: "31" })).toThrow();
    expect(() => parseEnv({ ENRICHMENT_PROVIDER: "invalid" })).toThrow();
    expect(parseEnv({ OPENAI_MODEL: "different-model" }).OPENAI_MODEL).toBe("different-model");
    expect(parseEnv({ ENRICHMENT_PROVIDER: "xkiro" }).OPENAI_API_KEY).toBeUndefined();
    expect(() => parseEnv({ TURSO_DATABASE_URL: "libsql://example.turso.io" })).toThrow("token");
    expect(() => parseEnv({ CRON_SECRET: "short" })).toThrow("32 characters");
    expect(() => parseEnv({ SOURCE_TIMEOUT_MS: "0" })).toThrow();
  });
  it.each(["openai", "xkiro", "heuristic"])("allows %s builds without either provider's credentials", (provider) => {
    const env = parseEnv({ ENRICHMENT_PROVIDER: provider, OPENAI_API_KEY: "", XKIRO_API_KEY: "",
      OPENAI_MODEL: "", XKIRO_BASE_URL: "", XKIRO_MODEL: "" });
    expect(env.ENRICHMENT_PROVIDER).toBe(provider);
    expect(env.OPENAI_API_KEY).toBeUndefined(); expect(env.XKIRO_API_KEY).toBeUndefined();
    expect(env.OPENAI_MODEL).toBe("gpt-6-luna"); expect(env.XKIRO_BASE_URL).toBe("https://api.xkiro.com/v1");
    expect(env.XKIRO_MODEL).toBeUndefined();
  });
  it("treats blank repository variables as absent while rejecting unknown provider names", () => {
    expect(parseEnv({ ENRICHMENT_PROVIDER: "", OPENAI_MODEL: " ", XKIRO_BASE_URL: "\t" })).toMatchObject({
      ENRICHMENT_PROVIDER: "heuristic", OPENAI_MODEL: "gpt-6-luna", XKIRO_BASE_URL: "https://api.xkiro.com/v1" });
    expect(() => parseEnv({ ENRICHMENT_PROVIDER: "unknown" })).toThrow("ENRICHMENT_PROVIDER");
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
