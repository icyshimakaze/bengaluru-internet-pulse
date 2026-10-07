import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("dashboard identifies Bengaluru, demo mode, multiple sources and momentum", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const backendRequests: string[] = [];
  page.on("request", (r) => { if (/(api\.openai\.com|\.turso\.io|api\.gdeltproject\.org|public\.api\.bsky\.app|hn\.algolia\.com)/i.test(r.url())) backendRequests.push(r.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bengaluru, in motion." })).toBeVisible();
  await expect(page.getByText("Demo snapshot.", { exact: true })).toBeVisible();
  await expect(page.getByText("Rising topics, measured from public signals across multiple sources.", { exact: false })).toBeVisible();
  await expect(page.locator(".trend-row")).toHaveCount(6);
  await page.screenshot({ path: ".cache/dashboard-desktop.png", fullPage: true });
  await page.getByRole("textbox", { name: "Search topics" }).fill("metro");
  await expect(page.locator(".trend-row")).toHaveCount(1);
  await page.getByRole("link", { name: "Namma Metro", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Namma Metro", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behind the score" })).toBeVisible();
  await expect(page.getByText("Demo topic · fictional evidence, real deterministic scoring.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example evidence" })).toBeVisible();
  expect(errors).toEqual([]);
  expect(backendRequests).toEqual([]);
});
test("filters, empty states and public API work", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Filter by category" }).selectOption("Weather");
  await expect(page.locator(".trend-row")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search topics" }).fill("impossible-query");
  await expect(page.getByRole("heading", { name: "No matching conversations" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".trend-row")).toHaveCount(6);
  const response = await request.get("/api/pulse"); expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.mode).toBe("demo"); expect(data.version).toBe("v2");
  expect(data.topTopics[0].current2h).toBeGreaterThanOrEqual(2);
  expect(data.topTopics[0].growthRatio).toBe((data.topTopics[0].current2h + 1) / (data.topTopics[0].previous2h + 1));
  expect(["NEW", "EMERGING", "RISING", "HOT", "STABLE", "COOLING"]).toContain(data.topTopics[0].lifecycle);
  expect((await request.get("/api/ingest")).status()).toBe(401);
  expect((await request.get("/api/topics/missing")).status()).toBe(404);
});
test("pages are accessible and fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/topic/namma-metro", "/about"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
    if (path === "/") await page.screenshot({ path: ".cache/dashboard-mobile.png", fullPage: true });
    if (path === "/topic/namma-metro") await page.screenshot({ path: ".cache/topic-mobile.png", fullPage: true });
  }
});
test("unconfigured live mode shows honest empty data and fails operational health", async ({ page, request }) => {
  await page.goto("http://127.0.0.1:3001/");
  await expect(page.getByRole("heading", { name: "Waiting for a pulse" })).toBeVisible();
  await expect(page.getByText("Demo snapshot.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".trend-row")).toHaveCount(0);
  const response = await request.get("http://127.0.0.1:3001/api/pulse");
  expect(response.status()).toBe(503);
  const data = await response.json();
  expect(data.mode).toBe("live"); expect(data.generatedAt).toBeNull();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  const health = await request.get("http://127.0.0.1:3001/api/health"); expect(health.status()).toBe(503);
  expect(await health.json()).toMatchObject({ application: { status: "ok" }, database: { status: "unconfigured" }, recentSignalCount: null });
});
test("public query routes expose filtered, bounded models and proper errors", async ({ request }) => {
  for (const [window, signalCount] of [["2h", 79], ["6h", 119], ["24h", 221]] as const) {
    const response = await request.get("/api/pulse?window=" + window); expect(response.status()).toBe(200);
    const data = await response.json(); expect(data.signalCount).toBe(signalCount); expect(data.snapshot.scoringWindow).toBe("2h");
    expect(data.sourceStream).toHaveLength(30); expect(data.sourceStream[0]).not.toHaveProperty("sourceId");
    expect(data.topTopics[0]).not.toHaveProperty("evidence");
  }
  const filtered = await (await request.get("/api/pulse?window=6h&category=Weather&source=gdelt")).json();
  expect(filtered.topTopics).toHaveLength(1); expect(filtered.topTopics[0].sourceCount).toBe(3);
  expect(filtered.sourceStream.every((s: { source: string }) => s.source === "gdelt")).toBe(true);
  const detail = await (await request.get("/api/topics/namma-metro")).json();
  expect(detail.history[0].algorithmVersion).toBe("v2"); expect(detail.sourceEvidence).toHaveLength(30);
  expect(detail.relatedSignals.length).toBeGreaterThan(0); expect(detail.topic).not.toHaveProperty("method");
  const spots = await (await request.get("/api/hotspots?category=Weather")).json();
  expect(spots.hotspots[0]).toMatchObject({ neighborhood: "Hebbal", topTopic: { slug: "rain-and-waterlogging" }, averagePulse: expect.any(Number) });
  expect((await request.get("/api/pulse?window=3h")).status()).toBe(400);
  expect((await request.get("/api/pulse?source=gdelt&source=bluesky")).status()).toBe(400);
  expect((await request.post("/api/pulse")).status()).toBe(405);
});
