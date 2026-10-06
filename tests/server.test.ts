import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/server/env";
import { authorized } from "@/lib/server/auth";
import { ageSnapshot, emptyPulse } from "@/lib/server/read";
import { now, pulse } from "./helpers";
import { HOUR } from "@/lib/trends/engine";
describe("configuration and read safety", () => {
  it("defaults to explicitly labeled demo and validates server credentials", () => {
    expect(parseEnv({}).APP_DATA_MODE).toBe("demo");
    expect(() => parseEnv({ AI_ENABLED: "true" })).toThrow("API key");
    expect(() => parseEnv({ TURSO_DATABASE_URL: "libsql://example.turso.io" })).toThrow("token");
    expect(() => parseEnv({ CRON_SECRET: "short" })).toThrow("32 characters");
    expect(() => parseEnv({ SOURCE_TIMEOUT_MS: "0" })).toThrow();
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
