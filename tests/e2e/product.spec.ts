import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("dashboard identifies Bengaluru, demo mode, multiple sources and momentum", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
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
  expect((await response.json()).mode).toBe("demo");
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
  expect((await request.get("http://127.0.0.1:3001/api/health")).status()).toBe(503);
});
