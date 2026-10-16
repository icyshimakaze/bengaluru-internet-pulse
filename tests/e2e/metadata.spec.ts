import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LIVE_BASE_URL } from "./urls";

for (const path of ["/", "/about", "/topic/namma-metro"]) {
  test(`page ${path} emits its canonical and social metadata`, async ({ page }) => {
    await page.goto(path);
    const canonical = "https://bengaluru-internet-pulse.vercel.app" + path;
    const canonicalPattern = path === "/" ? /^https:\/\/bengaluru-internet-pulse\.vercel\.app\/?$/ : canonical;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonicalPattern);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", canonicalPattern);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Bengaluru Pulse/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://bengaluru-internet-pulse.vercel.app/opengraph-image.png");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  });
}

test("favicon, share assets and demo crawl restrictions are served", async ({ request }) => {
  const image = await request.get("/opengraph-image.png", { maxRetries: 1 });
  expect(image.status()).toBe(200); expect(image.headers()["content-type"]).toContain("image/png");
  const favicon = await request.get("/favicon.ico"); expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/");
  const apple = await request.get("/apple-icon.png"); expect(apple.status()).toBe(200);
  const crawl = await request.get("/robots.txt"); expect(crawl.status()).toBe(200); expect(await crawl.text()).toContain("Disallow: /");
  const map = await request.get("/sitemap.xml"); expect(map.status()).toBe(200); expect(await map.text()).not.toContain("<url>");
  const api = await request.get("/api/health"); expect(api.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("live crawl routes use the production origin without requiring data collection", async ({ request }) => {
  const crawl = await request.get(LIVE_BASE_URL + "/robots.txt");
  expect(crawl.status()).toBe(200); expect(await crawl.text()).toContain("Allow: /");
  expect(await crawl.text()).toContain("Disallow: /api/");
  expect(await crawl.text()).toContain("Sitemap: https://bengaluru-internet-pulse.vercel.app/sitemap.xml");
  const map = await request.get(LIVE_BASE_URL + "/sitemap.xml");
  expect(map.status()).toBe(200); expect(await map.text()).toContain("https://bengaluru-internet-pulse.vercel.app/about");
  expect(await map.text()).not.toContain("localhost"); expect(await map.text()).not.toContain("127.0.0.1");
});

test("missing topics are not indexed and inherit no canonical URL", async ({ page }) => {
  await page.goto("/topic/missing-topic");
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("production browser bundles contain no database or AI credential names or endpoints", () => {
  let count = 0;
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith(".js")) {
        const content = readFileSync(path, "utf8");
        expect(content, entry.name).not.toMatch(/TURSO_AUTH_TOKEN|TURSO_DATABASE_URL|XKIRO_API_KEY|OPENAI_API_KEY|api\.openai\.com|api\.xkiro\.com/);
        count++;
      }
    }
  }
  scan(".next/static"); expect(count).toBeGreaterThan(0);
});
