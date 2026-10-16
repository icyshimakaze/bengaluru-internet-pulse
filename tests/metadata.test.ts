import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMetadata, siteOrigin } from "@/lib/server/metadata";
import { indexingAllowed } from "@/lib/server/site-config";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

afterEach(() => vi.unstubAllEnvs());
describe("production metadata", () => {
  it("uses an explicit validated production URL before Vercel's inferred domain", () => {
    expect(siteOrigin({ SITE_URL: "https://pulse.example.com", VERCEL_PROJECT_PRODUCTION_URL: "other.vercel.app" }).origin).toBe("https://pulse.example.com");
  });
  it.each(["http://pulse.example.com", "https://localhost:3000", "https://127.0.0.1", "https://[::1]", "https://0.0.0.0", "https://192.168.1.4", "https://user:PRIVATE_TOKEN@pulse.example.com",
    "https://pulse.example.com/path", "https://pulse.example.com?token=PRIVATE_TOKEN", "https://pulse.example.com#fragment"])("rejects invalid explicit origin %s with a redacted error", (url) => {
    expect(() => siteOrigin({ SITE_URL: url })).toThrow("SITE_URL");
    try { siteOrigin({ SITE_URL: url }); } catch (error) { expect(String(error)).not.toContain("PRIVATE_TOKEN"); }
  });
  it("indexes production live pages while excluding demo, preview and local development", () => {
    expect(indexingAllowed({ NODE_ENV: "production", APP_DATA_MODE: "live" })).toBe(true);
    expect(indexingAllowed({ NODE_ENV: "production", TURSO_DATABASE_URL: "libsql://database.example" })).toBe(true);
    expect(indexingAllowed({ NODE_ENV: "production", APP_DATA_MODE: "demo" })).toBe(false);
    expect(indexingAllowed({ NODE_ENV: "production", APP_DATA_MODE: "live", VERCEL_ENV: "preview" })).toBe(false);
    expect(indexingAllowed({ NODE_ENV: "development", APP_DATA_MODE: "live" })).toBe(false);
    expect(indexingAllowed({ NODE_ENV: "production" })).toBe(false);
  });
  it("publishes crawl rules and only stable sitemap pages without database or source requests", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_DATA_MODE", "live"); vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SITE_URL", "https://pulse.example.com");
    const fetcher = vi.spyOn(globalThis, "fetch");
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: "https://pulse.example.com/sitemap.xml" });
    expect(sitemap().map((row) => row.url)).toEqual(["https://pulse.example.com/", "https://pulse.example.com/about"]);
    vi.stubEnv("APP_DATA_MODE", "demo"); expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } }); expect(sitemap()).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled(); fetcher.mockRestore();
  });
  it("uses the stable production domain even on previews, without requiring configuration", () => {
    expect(siteOrigin({}).origin).toBe("https://bengaluru-internet-pulse.vercel.app");
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "pulse.example.com", VERCEL_URL: "preview.vercel.app" }).origin).toBe("https://pulse.example.com");
  });
  it.each(["localhost", "127.0.0.1", "https://wrong.example", "user:SECRET@wrong.example", "wrong.example/path", "wrong.example?token=SECRET", "wrong.example#fragment"])("rejects malformed platform host %s without breaking page rendering", (host) => {
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: host }).origin).toBe("https://bengaluru-internet-pulse.vercel.app");
  });
  it("generates distinct absolute canonicals and matching share metadata for each page", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "pulse.example.com");
    for (const path of ["/", "/about", "/topic/namma-metro"]) {
      const data = pageMetadata("Topic | Bengaluru Pulse", "An evidence summary.", path);
      expect(String(data.alternates?.canonical)).toBe("https://pulse.example.com" + path);
      expect(data.openGraph).toMatchObject({ title: "Topic | Bengaluru Pulse", description: "An evidence summary.",
        url: new URL("https://pulse.example.com" + path), images: [{ url: new URL("https://pulse.example.com/opengraph-image.png"), width: 1200, height: 630 }] });
      expect(data.twitter).toMatchObject({ card: "summary_large_image" });
    }
  });
});
