import { test, expect } from "@playwright/test";
import { gzipSync } from "node:zlib";

test("heavy charts and street-map assets load on demand without shifting the page", async ({ page }) => {
  const assets: { bytes: number; gzip: number; chart: boolean; map: boolean; mapStyle: boolean }[] = [];
  const bodies: Promise<void>[] = [], errors: string[] = [], fonts: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.resourceType() === "font") fonts.push(request.url()); });
  page.on("response", (response) => {
    if (!response.url().includes("/_next/") || !["script", "stylesheet"].includes(response.request().resourceType())) return;
    bodies.push(response.body().then((body) => {
      const script = response.request().resourceType() === "script";
      assets.push({ bytes: script ? body.length : 0, gzip: script ? gzipSync(body).length : 0,
        chart: script && body.includes("recharts-wrapper"), map: script && body.includes("leaflet-pane"),
        mapStyle: !script && body.includes(".leaflet-zoom-animated") });
    }));
  });
  await page.addInitScript(() => {
    const state = window as Window & { pulseLayoutShift?: number };
    state.pulseLayoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
        if (!entry.hadRecentInput) state.pulseLayoutShift! += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/"); await page.waitForLoadState("networkidle"); await Promise.all(bodies);
  expect(assets.some((asset) => asset.chart || asset.map || asset.mapStyle)).toBe(false);
  expect(assets.reduce((total, asset) => total + asset.bytes, 0)).toBeLessThan(800_000);
  expect(assets.reduce((total, asset) => total + asset.gzip, 0)).toBeLessThan(230_000);
  expect(fonts).toEqual([]);

  const plot = page.locator(".momentum-chart");
  const before = (await plot.boundingBox())!.height;
  await plot.scrollIntoViewIfNeeded();
  await expect(plot.locator(".recharts-line-curve")).toBeVisible();
  expect((await plot.boundingBox())!.height).toBe(before);
  await page.waitForLoadState("networkidle"); await Promise.all(bodies);
  expect(assets.some((asset) => asset.chart)).toBe(true);
  expect(assets.some((asset) => asset.map || asset.mapStyle)).toBe(false);
  expect(await page.evaluate(() => (window as Window & { pulseLayoutShift?: number }).pulseLayoutShift ?? 0)).toBeLessThan(0.01);

  const tile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64");
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ contentType: "image/png", body: tile }));
  await page.getByText("Open street map", { exact: true }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.waitForLoadState("networkidle"); await Promise.all(bodies);
  expect(assets.some((asset) => asset.map)).toBe(true);
  expect(assets.some((asset) => asset.mapStyle)).toBe(true);
  expect(errors).toEqual([]);
});
