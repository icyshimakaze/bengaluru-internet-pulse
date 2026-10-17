import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

test("status drawer separates collection and enrichment and supports keyboard dismissal", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "System status: DEMO" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Behind the pulse" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Collection", exact: true })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Enrichment", exact: true })).toBeVisible();
  await expect(drawer).toContainText("Not used in demo");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
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
