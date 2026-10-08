import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Tile fixtures make browser verification independent of network availability and OSM load.
const tile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64");
async function fixtureTiles(page: Page) { await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ contentType: "image/png", body: tile })); }
const mapRegion = (page: Page) => page.getByRole("region", { name: "Bengaluru neighborhood activity street map", exact: true });
async function openMap(page: Page) { await page.getByText("Open street map", { exact: true }).click(); await expect(mapRegion(page).locator(".leaflet-container")).toBeVisible(); }

test("SSR stays browser-free; mounting and reopening retain attribution without hydration errors", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydrat|did not match|server rendered/i.test(message.text())) errors.push(message.text()); });
  const html = await (await request.get("/")).text(); expect(html).not.toContain('class="leaflet-container');
  await fixtureTiles(page); await page.goto("/");
  const data = await (await request.get("/api/hotspots")).json();
  for (let i = 0; i < 3; i++) {
    await openMap(page);
    await expect(mapRegion(page).locator(".hotspot-activity-marker")).toHaveCount(data.hotspots.length);
    const attribution = mapRegion(page).locator(".leaflet-control-attribution");
    await expect(attribution).toContainText("OpenStreetMap contributors");
    await expect(attribution.getByRole("link", { name: "OpenStreetMap", exact: true })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    await expect(mapRegion(page)).toContainText("fictional demo activity");
    await page.getByText("Open street map", { exact: true }).click();
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("hover, pointer and keyboard expose counts, top topic and score, synchronized with the list", async ({ page, request }) => {
  await fixtureTiles(page); await page.goto("/"); await openMap(page);
  const data = await (await request.get("/api/hotspots")).json();
  const hotspot = data.hotspots.find((h: { neighborhood: string }) => h.neighborhood === "Whitefield");
  const marker = mapRegion(page).getByRole("button", { name: /^Whitefield:/ });
  const quieter = mapRegion(page).getByRole("button", { name: /^Indiranagar:/ });
  await expect(marker).toBeVisible(); await expect(quieter).toBeVisible();
  expect((await marker.boundingBox())!.width).toBeGreaterThan((await quieter.boundingBox())!.width);
  expect(Number(await marker.getAttribute("fill-opacity"))).toBeGreaterThan(Number(await quieter.getAttribute("fill-opacity")));
  await marker.hover(); const tooltip = mapRegion(page).locator(".leaflet-tooltip");
  await expect(tooltip).toContainText("Whitefield");
  await expect(tooltip).toContainText(hotspot.activity + " recent signals");
  await expect(tooltip).toContainText(hotspot.topTopic.title);
  await expect(tooltip).toContainText("Pulse Score " + hotspot.topPulse);
  await marker.click(); const popup = mapRegion(page).locator(".leaflet-popup-content");
  await expect(popup).toContainText(hotspot.activity + " recent signals");
  await expect(popup.getByRole("link", { name: new RegExp(hotspot.topTopic.title) })).toHaveAttribute("href", "/topic/" + hotspot.topTopic.slug);
  await expect(page.locator(".neighborhood-selected h3")).toHaveText("Whitefield");
  await mapRegion(page).getByRole("button", { name: "Close popup" }).click();
  const hebbal = mapRegion(page).getByRole("button", { name: /^Hebbal:/ });
  await hebbal.focus(); await page.keyboard.press("Enter");
  await expect(popup).toContainText("Hebbal");
  await expect(page.locator(".neighborhood-selected h3")).toHaveText("Hebbal");
  await page.keyboard.press("Escape"); await expect(mapRegion(page).locator(".leaflet-popup")).toHaveCount(0);
  await page.getByRole("group", { name: "Neighborhood activity" }).getByRole("button", { name: /Indiranagar/ }).click();
  await expect(popup).toContainText("Indiranagar");
  const link = popup.getByRole("link", { name: /Food & cafés/ }); await link.click();
  await expect(page.getByRole("heading", { name: "Food & cafés", exact: true })).toBeVisible();
});

test("filters update map activity, and empty/citywide evidence produces no markers", async ({ page, request }) => {
  await fixtureTiles(page); await page.goto("/"); await openMap(page);
  await page.getByRole("button", { name: "Civic", exact: true }).click();
  await expect(mapRegion(page).locator(".hotspot-activity-marker")).toHaveCount(0);
  await expect(page.locator(".geo-point")).toHaveCount(0);
  await expect(mapRegion(page).locator(".map-empty")).toContainText("Citywide and unknown locations have no markers");
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await expect(mapRegion(page).locator(".hotspot-activity-marker")).toHaveCount(1);
  await expect(mapRegion(page).getByRole("button", { name: /^Indiranagar:/ })).toBeVisible();
  await page.getByRole("button", { name: "6H", exact: true }).click();
  const data = await (await request.get("/api/hotspots?window=6h&category=food")).json();
  await expect(mapRegion(page).getByRole("button", { name: /^Indiranagar:/ })).toHaveAttribute("aria-label", new RegExp(data.hotspots[0].activity + " recent signals in 6h"));
});

test("tile outages preserve evidence and attribution; user retry recovers the base map", async ({ page }) => {
  let available = false;
  await page.route("https://tile.openstreetmap.org/**", (route) => available ? route.fulfill({ contentType: "image/png", body: tile }) : route.abort());
  await page.goto("/"); await openMap(page);
  await expect(mapRegion(page).locator(".map-fallback")).toContainText("Base map tiles unavailable");
  await expect(mapRegion(page).locator(".hotspot-activity-marker")).not.toHaveCount(0);
  await expect(mapRegion(page).locator(".leaflet-control-attribution")).toBeVisible();
  available = true; await mapRegion(page).getByRole("button", { name: "Retry base map" }).click();
  await expect(mapRegion(page).locator(".map-fallback")).toHaveCount(0);
  await expect(mapRegion(page).locator(".leaflet-tile-loaded").first()).toBeVisible();
});

test("the open map and popup resize accessibly across desktop, tablet and mobile", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await fixtureTiles(page); await page.setViewportSize({ width: 1440, height: 950 }); await page.goto("/"); await openMap(page);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const marker = mapRegion(page).getByRole("button", { name: /^Whitefield:/ });
    await expect(marker).toBeVisible(); await marker.focus(); await page.keyboard.press("Enter");
    await expect(mapRegion(page).locator(".leaflet-popup-content")).toContainText("Pulse Score");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    if (width === 390) await mapRegion(page).screenshot({ path: ".cache/hotspot-map-mobile.png" });
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});
