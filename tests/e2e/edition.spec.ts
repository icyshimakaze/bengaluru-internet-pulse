import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("RSS provenance, Jobs exclusions and local language badges remain accessible", async ({ page, request }) => {
  const stored = await (await request.get("/api/pulse")).json(), checkedAt = new Date().toISOString();
  await page.goto("/");
  await page.route("**/api/pulse?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { ...stored, mode: "live", status: "healthy", stale: false, generatedAt: checkedAt,
      lastSuccessfulIngestion: checkedAt, notice: null, topTopics: [], risingTopics: [], recentConversations: [],
      filters: { category: params.get("category"), source: params.get("source") },
      sources: [...stored.sources, { ...stored.sources[0], source: "rss", status: "ok", healthState: "live", stale: false, checkedAt, lastSuccessAt: checkedAt }],
      sourceStream: [{ ...stored.sourceStream[0], source: "rss", sourceType: "news", language: "Kannada",
        title: "SYNTHETIC fixture: ಬೆಂಗಳೂರು #Hiring", filterReason: "job_posting", observedCategory: "jobs", publisherName: "Synthetic local paper" }],
    } });
  });
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await page.getByLabel("Filter by source").selectOption("rss");
  await page.getByLabel("Topic category").selectOption("jobs");
  await expect(page.locator(".stream-list")).toContainText("Synthetic local paper");
  await expect(page.locator(".stream-list")).toContainText("Jobs · excluded from momentum");
  await expect(page.locator(".stream-list .language-badge")).toHaveText("Kannada");
  await expect(page.locator(".lead-topic")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("keyed Currents renders as a fourth news provider with attribution and accessible mobile controls", async ({ page, request }) => {
  const stored = await (await request.get("/api/pulse")).json();
  const checkedAt = new Date().toISOString();
  const sources = stored.sources.map((source: object) => ({ ...source, status: "ok", healthState: "live", stale: false, checkedAt, lastSuccessAt: checkedAt }));
  const currents = { ...sources[0], source: "currents" };
  const signal = { ...stored.sourceStream[0], source: "currents", sourceType: "news", title: "Currents integration test: Bengaluru metro report" };
  await page.goto("/");
  await page.route("**/api/pulse?**", (route) => route.fulfill({ json: { ...stored, mode: "live", status: "healthy", stale: false,
    generatedAt: checkedAt, notice: null, sources: [...sources, currents], availableSources: ["gdelt", "bluesky", "hackernews", "currents"],
    sourceStream: [signal], signalCount: 1, filters: { ...stored.filters, source: new URL(route.request().url()).searchParams.get("source") } } }));
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await expect(page.locator(".hero-coverage")).toContainText("4 of 4 sources available");
  await expect(page.getByLabel("Filter by source").getByRole("option", { name: "Currents", exact: true })).toHaveCount(1);
  await page.getByRole("group", { name: "Source stream type" }).getByRole("button", { name: "News", exact: true }).click();
  await expect(page.locator(".stream-list")).toContainText(signal.title);
  await expect(page.locator(".stream-list").getByRole("link", { name: "Powered by Currents News API", exact: false })).toHaveAttribute("href", "https://currentsapi.services/");
  await expect(page.locator(".stream-list .source-attribution")).toHaveCSS("font-size", "12px");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
  }
});

test("recent conversations expose early evidence separately from momentum and follow search", async ({ page, request }) => {
  const stored = await (await request.get("/api/pulse")).json();
  const early = stored.topTopics[1];
  await page.goto("/");
  await page.route("**/api/pulse?**", (route) => route.fulfill({ json: { ...stored, topTopics: stored.topTopics.slice(0, 1), recentConversations: [{
    slug: early.slug, title: early.title, category: early.semanticCategory, neighborhood: early.neighborhood,
    latestAt: stored.evaluatedAt, signalCount: 1, sources: ["gdelt"],
  }] } }));
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  const recent = page.getByRole("region", { name: "Recently observed" });
  await expect(recent).toContainText("1 signal / 24H");
  await expect(page.locator(".trend-entry")).toHaveCount(1);
  await expect(recent.getByRole("link", { name: early.title })).toHaveAttribute("href", `/topic/${early.slug}`);
  await expect(recent).not.toContainText("Pulse Score");
  await page.getByRole("searchbox", { name: "Search topics" }).fill("query-with-no-matching-conversation");
  await expect(recent).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search topics" }).fill("");
  await expect(recent).toBeVisible();
});

test("NOW widens quiet windows honestly and explicit selections stay fixed", async ({ page, request }) => {
  const stored = await (await request.get("/api/pulse?window=6h")).json();
  await page.goto("/");
  await page.route("**/api/pulse?**", async (route) => {
    const window = new URL(route.request().url()).searchParams.get("window");
    await route.fulfill({ json: window === "now" ? { ...stored, requestedWindow: "now" } :
      { ...stored, requestedWindow: "2h", window: "2h", topTopics: [], risingTopics: [], sourceStream: [], signalCount: 0,
        snapshot: { ...stored.snapshot, queryWindow: "2h" } } });
  });
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await expect(page.locator(".window-explanation")).toHaveText("2H is quiet · showing 6H activity. Scores still measure the latest 2H.");
  await expect(page.locator(".lead-evidence")).toContainText("Signals · 6H");
  await page.getByRole("group", { name: "Activity time window" }).getByRole("button", { name: "2H", exact: true }).click();
  await expect(page.locator(".window-explanation")).toContainText("2H activity");
  await expect(page.locator(".trend-entry")).toHaveCount(0);
});

test("older wider-window conversations never become a scored lead", async ({ page, request }) => {
  const stored = await (await request.get("/api/pulse?window=6h")).json();
  await page.goto("/");
  await page.route("**/api/pulse?**", (route) => route.fulfill({ json: { ...stored, requestedWindow: "now",
    topTopics: stored.topTopics.map((topic: Record<string, unknown>) => ({ ...topic, current2h: 0, sourceCount: 0, score: 0, lifecycle: "COOLING" })),
    recentConversations: stored.topTopics.slice(0, 4).map((topic: Record<string, unknown>) => ({ slug: topic.slug,
      title: topic.title, category: topic.semanticCategory, neighborhood: topic.neighborhood, latestAt: stored.evaluatedAt,
      signalCount: topic.activityCount, sources: ["gdelt"] })),
  } }));
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await expect(page.locator("#rising-heading")).toContainText("Recent observations");
  await expect(page.locator(".lead-topic")).toHaveCount(0);
  await expect(page.locator(".trend-entry")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Top stories in the last 24 hours" })).toBeVisible();
  await expect(page.locator(".recent-conversations")).not.toContainText("Pulse Score");
  await expect(page.locator(".window-explanation")).toContainText("2H is quiet");
});

test("status page separates collection and enrichment with one masthead and footer links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Behind the pulse" })).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("link", { name: /GitHub/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Status · Demo" }).click();
  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Behind the pulse" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Collection", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enrichment", exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("Not used in demo");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  }
  await expect(page.getByRole("link", { name: "Contact", exact: true })).toHaveCount(0);
});

test("source-type controls browse loaded evidence and topic shares copy the canonical URL", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Source stream type" }).getByRole("button", { name: "Social", exact: true }).click();
  for (const row of await page.locator(".stream-source-name").all()) await expect(row).toHaveText("Bluesky");
  await page.getByRole("group", { name: "Source stream type" }).getByRole("button", { name: "Tech", exact: true }).click();
  for (const row of await page.locator(".stream-source-name").all()) await expect(row).toHaveText("Hacker News");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/topic/namma-metro");
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "Share trend" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://bengaluru-internet-pulse.vercel.app/topic/namma-metro");
});

test("wide layouts preserve paper colour, avoid overflow and respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1920, 1600, 1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 1080 }); await page.goto("/");
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      main: document.querySelector("main")!.getBoundingClientRect().width,
      background: getComputedStyle(document.documentElement).backgroundColor,
      animation: getComputedStyle(document.querySelector(".trend-entry")!).animationName }));
    expect(dimensions.document).toBeLessThanOrEqual(width);
    expect(dimensions.background).toBe("rgb(248, 247, 242)");
    expect(dimensions.animation).toBe("none");
    if (width >= 1280) expect(dimensions.main / width).toBeGreaterThan(0.9);
  }
});

test("topic social image uses the persisted topic and serves an actual PNG", async ({ request }) => {
  const image = await request.get("/api/og/namma-metro");
  expect(image.status()).toBe(200); expect(image.headers()["content-type"]).toContain("image/png");
  const bytes = await image.body();
  expect(bytes.readUInt32BE(16)).toBe(1200); expect(bytes.readUInt32BE(20)).toBe(630);
  expect(image.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/api/og/no-such-topic")).status()).toBe(404);
});
