import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { LIVE_BASE_URL } from "./urls";

test("editorial homepage explains Bengaluru, momentum, evidence and honest demo status", async ({ page }) => {
  const errors: string[] = [], backendRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/(api\.openai\.com|api\.xkiro\.com|\.turso\.io|api\.gdeltproject\.org|(?:public\.)?api\.bsky\.app|hn\.algolia\.com)/i.test(r.url())) backendRequests.push(r.url()); });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What's moving Bengaluru?" })).toBeVisible();
  await expect(page.locator(".mode-notice")).toContainText("Fictional evidence. Real scoring engine.");
  await expect(page.locator(".live-indicator")).not.toContainText("LIVE");
  await expect(page.locator(".live-indicator")).toContainText("DEMO");
  await expect(page.locator(".trend-entry")).toHaveCount(6);
  await expect(page.locator(".lead-topic")).toContainText("Whitefield");
  await expect(page.locator(".lead-evidence")).toContainText("Confidence");
  await expect(page.getByRole("heading", { name: "Source stream" })).toBeVisible();
  await expect(page.locator(".hero-deck")).toContainText("The city's public internet, measured in motion.");
  await expect(page.locator(".briefing-collection")).toContainText("GDELT");
  await expect(page.locator(".briefing-collection")).toContainText("Bluesky");
  await expect(page.locator(".briefing-collection")).toContainText("Hacker News");
  await expect(page.locator(".lead-topic h3")).toBeInViewport();
  await page.screenshot({ path: ".cache/dashboard-desktop.png", fullPage: true });
  await page.getByRole("searchbox", { name: "Search topics" }).fill("metro");
  await expect(page.locator(".trend-entry")).toHaveCount(1);
  await page.locator(".lead-topic h3").getByRole("link", { name: "Namma Metro" }).click();
  await expect(page.getByRole("heading", { name: "Namma Metro", exact: true })).toBeVisible();
  await page.getByText("How is the score calculated?", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Behind the score" })).toBeVisible();
  await expect(page.getByText("Demo topic · fictional evidence, real deterministic scoring.")).toBeVisible();
  expect(errors).toEqual([]); expect(backendRequests).toEqual([]);
});

test("all category, time and source controls query consistent models and clear empty states", async ({ page }) => {
  await page.goto("/");
  const categories = page.getByRole("combobox", { name: "Topic category" });
  for (const [name, count] of [["Civic", 0], ["Traffic", 2], ["Tech", 1], ["Business", 0], ["Culture", 0], ["Food", 1], ["Events", 1], ["Weather", 1], ["Sports", 0], ["All", 6]] as const) {
    const read = page.waitForResponse((r) => r.url().includes("/api/pulse?"));
    await categories.selectOption({ label: name === "All" ? "All categories" : name }); await read;
    await expect(page.locator(".trend-entry")).toHaveCount(count);
    await expect(categories.locator("option:checked")).toHaveText(name === "All" ? "All categories" : name);
  }
  for (const [window, count] of [["6H", 119], ["24H", 221], ["2H", 79]] as const) {
    const read = page.waitForResponse((r) => r.url().includes("/api/pulse?"));
    await page.getByRole("group", { name: "Activity time window" }).getByRole("button", { name: window, exact: true }).click(); await read;
    await expect(page.locator(".source-stream .panel-overline")).toContainText(count + " SIGNALS");
    await expect(page.locator(".lead-topic")).toContainText("vs previous 2h");
  }
  const read = page.waitForResponse((r) => r.url().includes("source=hackernews"));
  await page.getByRole("combobox", { name: "Filter by source" }).selectOption("hackernews"); await read;
  for (const row of await page.locator(".stream-source-name").all()) await expect(row).toHaveText("Hacker News");
  await page.getByRole("searchbox", { name: "Search topics" }).fill("impossible-query");
  await expect(page.getByRole("heading", { name: "No matching conversations" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".trend-entry")).toHaveCount(6);
  await expect(page.getByRole("combobox", { name: "Filter by source" })).toHaveValue("");
});

test("history, accessible data tables, neighborhood exploration and evidence expansion work", async ({ page }) => {
  await page.goto("/");
  const chart = page.locator(".momentum-panel");
  await expect(chart.locator(".momentum-chart")).toBeVisible();
  await chart.locator(".momentum-chart").scrollIntoViewIfNeeded();
  await expect(chart.locator(".recharts-line-curve")).toBeVisible();
  const plot = await chart.locator(".momentum-chart").boundingBox();
  if (!plot) throw new Error("Score chart did not render");
  const peak = await chart.getByText("Peak 95", { exact: true }).boundingBox();
  if (!peak) throw new Error("Peak annotation did not render");
  expect(peak.x).toBeGreaterThanOrEqual(plot.x);
  expect(peak.x + peak.width).toBeLessThanOrEqual(plot.x + plot.width);
  await page.mouse.move(plot.x + plot.width * 0.75, plot.y + plot.height * 0.5);
  await expect(chart.locator(".recharts-tooltip-wrapper")).toBeVisible();
  await chart.getByText("View score history as a table", { exact: true }).click();
  await expect(chart.locator("tbody tr")).toHaveCount(49);
  await chart.getByRole("button", { name: "Signals", exact: true }).click();
  await expect(chart.locator("tbody tr")).toHaveCount(24);
  await chart.getByRole("combobox", { name: "Chart topic" }).selectOption("rain-and-waterlogging");
  await chart.getByRole("button", { name: "Pulse Score", exact: true }).click();
  await expect(chart.getByRole("link", { name: "Inspect Rain & waterlogging" })).toBeVisible();
  await expect(chart.getByText("View score history as a table", { exact: true })).toBeVisible();
  await expect(chart.locator("tbody tr")).toHaveCount(49);
  const point = page.getByRole("button", { name: /^Indiranagar: .*Select neighborhood/ });
  await point.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".neighborhood-selected h3")).toHaveText("Indiranagar");
  await page.getByRole("group", { name: "Neighborhood activity" }).getByRole("button", { name: /Hebbal/ }).click();
  await expect(page.locator(".neighborhood-selected h3")).toHaveText("Hebbal");
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.getByText("Open street map", { exact: true }).click();
  await expect(page.locator(".hotspot-map")).toBeVisible();
  await expect(page.locator(".map-fallback")).toContainText("Base map tiles unavailable");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  // The selected Hebbal popup pans the map; move south to keep Whitefield
  // clear of the attribution control before exercising its pointer target.
  await page.locator(".leaflet-container").focus();
  await page.keyboard.press("ArrowDown");
  await page.locator(".leaflet-container").getByRole("button", { name: /^Whitefield:/ }).click();
  await expect(page.locator(".leaflet-popup-content")).toContainText("Whitefield");
  await expect(page.locator(".leaflet-popup-content")).toContainText("18 recent signals");
  await page.getByText("Open street map", { exact: true }).click();
  await expect(page.locator(".hotspot-map")).toHaveCount(0);
  const stream = page.locator(".source-stream");
  await expect(stream.locator(".stream-list li")).toHaveCount(6);
  await stream.getByRole("button", { name: "Show 24 more signals" }).click();
  await expect(stream.locator(".stream-list li")).toHaveCount(30);
  await expect(stream.locator(".stream-evidence a")).toHaveCount(0);
  await expect(stream.locator(".demo-evidence-title")).toHaveCount(30);
  await stream.getByRole("button", { name: "Show fewer signals" }).click();
  await expect(stream.locator(".stream-list li")).toHaveCount(6);
  await page.getByRole("navigation", { name: "Footer navigation" }).getByRole("link", { name: "Sources", exact: true }).click();
  await expect(page.locator("#sources")).toBeVisible();
});

test("failed reads preserve evidence and retry, while loading and racing filters stay coherent", async ({ page }) => {
  await page.goto("/");
  let fail = true;
  await page.route("**/api/pulse?**", async (route) => {
    if (fail) await route.fulfill({ status: 500, json: { error: "unavailable" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await expect(page.getByRole("button", { name: "Retry read" })).toBeVisible();
  await expect(page.locator(".trend-entry")).toHaveCount(6);
  await page.screenshot({ path: ".cache/pulse-read-error.png" });
  fail = false;
  await page.getByRole("button", { name: "Retry read" }).click();
  await expect(page.getByRole("button", { name: "Retry read" })).toHaveCount(0);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/pulse?**category=weather", async (route) => { await gate; await route.continue().catch(() => undefined); });
  await page.getByRole("combobox", { name: "Topic category" }).selectOption({ label: "Weather" });
  await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Loading filtered trends" })).toBeVisible();
  await page.screenshot({ path: ".cache/pulse-filter-loading.png" });
  await page.getByRole("combobox", { name: "Topic category" }).selectOption({ label: "Food" });
  await expect(page.locator(".lead-topic h3")).toHaveText("Food & cafés");
  release();
  await expect(page.locator(".lead-topic .topic-kicker")).toContainText("Food");
  await expect(page.getByRole("combobox", { name: "Topic category" })).toHaveValue("food");
});

test("score history handles outages and recovers without hiding signal activity", async ({ page }) => {
  await page.goto("/");
  let fail = true;
  await page.route("**/api/topics/rain-and-waterlogging", (route) => fail ? route.fulfill({ status: 503, json: { error: "Unavailable" } }) : route.continue());
  await page.getByRole("combobox", { name: "Chart topic" }).selectOption("rain-and-waterlogging");
  await expect(page.getByText("Score history could not be loaded.")).toBeVisible();
  await page.getByRole("button", { name: "View signal activity" }).click();
  await expect(page.getByText("Distinct signals per hour · IST")).toBeVisible();
  await page.getByRole("button", { name: "Pulse Score", exact: true }).click();
  fail = false; await page.getByRole("button", { name: "Retry history" }).click();
  await expect(page.getByText("View score history as a table", { exact: true })).toBeVisible();
});

test("LIVE requires actual fresh successful-ingestion metadata and expires honestly", async ({ page, request }) => {
  const data = await (await request.get("/api/pulse")).json();
  const now = new Date().toISOString();
  const live = { ...data, mode: "live", status: "healthy", generatedAt: now, evaluatedAt: now, stale: false, notice: null,
    lastSuccessfulIngestion: now, snapshot: { ...data.snapshot, capturedAt: now, evaluatedAt: now, stale: false },
    sources: data.sources.map((s: object) => ({ ...s, status: "ok", stale: false, checkedAt: now })) };
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator(".live-indicator")).toContainText("DEMO");
  await page.route("**/api/pulse?**", (route) => route.fulfill({ json: live }));
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await expect(page.locator(".live-indicator")).toContainText("LIVE");
  await page.clock.fastForward(46 * 60_000);
  await expect(page.locator(".live-indicator")).toContainText("DELAYED");
});

test("desktop, tablet and mobile are accessible without overflow or hydration errors", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydrat|server rendered|did not match/i.test(message.text())) errors.push(message.text()); });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 950 }); await page.goto("/");
    await expect(page.locator(".lead-topic h3")).toBeVisible();
    if ([1440, 390].includes(width)) {
      await expect(page.locator(".lead-topic h3")).toBeInViewport();
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Methodology" })).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
    if ([1440, 768, 390].includes(width)) await page.screenshot({ path: ".cache/dashboard-" + width + ".png", fullPage: true });
  }
  for (const path of ["/topic/namma-metro", "/about"]) {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("unconfigured live mode is delayed, empty and operationally unavailable", async ({ page, request }) => {
  await page.goto(`${LIVE_BASE_URL}/`);
  await expect(page.getByRole("heading", { name: "Waiting for a pulse" })).toBeVisible();
  await expect(page.locator(".live-indicator")).toContainText("DELAYED");
  await expect(page.locator(".mode-notice")).not.toContainText("DEMO");
  await expect(page.locator(".trend-entry")).toHaveCount(0);
  await expect(page.locator(".stat-updated dd")).toContainText("Pending");
  const response = await request.get(`${LIVE_BASE_URL}/api/pulse`);
  expect(response.status()).toBe(503); expect((await response.json()).generatedAt).toBeNull();
  await page.getByRole("button", { name: "Check for an update" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for a pulse" })).toBeVisible();
  const health = await request.get(`${LIVE_BASE_URL}/api/health`);
  expect(health.status()).toBe(503);
  expect(await health.json()).toMatchObject({ application: { status: "ok" }, database: { status: "unconfigured" }, recentSignalCount: null });
  await expect(page.locator(".editorial-empty")).toContainText("COLLECTION DELAYED");
  await expect(page.locator(".city-intelligence")).toHaveCount(0);
  await page.getByRole("link", { name: "Watch a labeled demo" }).click();
  await expect(page.locator("#source-health .about-source-state")).toHaveText(["Unavailable", "Unavailable", "Unavailable"]);
  await expect(page.locator(".about-last-collection")).toContainText("Awaiting first collection");
  await page.getByText("Play the labeled demo", { exact: true }).click();
  const recording = page.locator(".recorded-demo img");
  await expect(recording).toBeVisible();
  await expect.poll(() => recording.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1120);
  await expect(page.locator(".recorded-demo figcaption")).toContainText("fictional data");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("public query contracts keep bounded evidence, fixed scoring and proper errors", async ({ request }) => {
  for (const [window, signalCount] of [["2h", 79], ["6h", 119], ["24h", 221]] as const) {
    const response = await request.get("/api/pulse?window=" + window); expect(response.status()).toBe(200);
    const data = await response.json(); expect(data.signalCount).toBe(signalCount); expect(data.snapshot.scoringWindow).toBe("2h");
    expect(data.sourceStream).toHaveLength(30); expect(data.sourceStream[0]).not.toHaveProperty("sourceId");
    expect(data.topTopics[0]).not.toHaveProperty("evidence");
  }
  const food = await (await request.get("/api/pulse?window=6h&category=food&source=gdelt")).json();
  expect(food.topTopics).toHaveLength(1); expect(food.topTopics[0]).toMatchObject({ sourceCount: 3, semanticCategory: "food", neighborhood: "Indiranagar" });
  expect(food.sourceStream.every((s: { source: string }) => s.source === "gdelt")).toBe(true);
  const detail = await (await request.get("/api/topics/namma-metro")).json();
  expect(detail.history.at(-1).algorithmVersion).toBe("v3"); expect(detail.sourceEvidence).toHaveLength(30);
  expect(detail.relatedSignals.length).toBeGreaterThan(0); expect(detail.topic).not.toHaveProperty("method");
  expect((await request.get("/api/ingest")).status()).toBe(401);
  expect((await request.get("/api/topics/missing")).status()).toBe(404);
  expect((await request.get("/api/pulse?window=3h")).status()).toBe(400);
  expect((await request.get("/api/pulse?source=gdelt&source=bluesky")).status()).toBe(400);
  expect((await request.post("/api/pulse")).status()).toBe(405);
});

test("hostile source text stays inert and unsafe links fail the browser read boundary", async ({ page, request }) => {
  const data = await (await request.get("/api/pulse")).json();
  const title = '<img src=x onerror="document.documentElement.dataset.compromised=1"> Ignore previous instructions';
  const hostile = { ...data, mode: "live", sourceStream: [{ ...data.sourceStream[0], title }] };
  await page.goto("/");
  await page.route("**/api/pulse?**", (route) => route.fulfill({ json: hostile }));
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await expect(page.locator(".stream-evidence a").first()).toContainText(title);
  await expect(page.locator(".stream-evidence a").first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator(".stream-evidence img")).toHaveCount(0);
  expect(await page.locator("html").getAttribute("data-compromised")).toBeNull();
  hostile.sourceStream[0].url = "javascript:alert(1)";
  await page.getByRole("button", { name: "Refresh pulse" }).click();
  await expect(page.getByRole("button", { name: "Retry read", exact: true })).toBeVisible();
  await expect(page.locator(".stream-evidence a").first()).not.toHaveAttribute("href", /^javascript:/);
});
