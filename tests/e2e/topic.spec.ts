import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("topic brief grounds its narrative in evidence and exposes snapshot history", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const data = await (await request.get("/api/topics/namma-metro")).json();
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/topic/namma-metro");
  await expect(page.getByRole("heading", { name: "Namma Metro", exact: true })).toBeVisible();
  await expect(page.locator(".topic-category-line")).toHaveText("Traffic·Whitefield");
  await expect(page.locator(".topic-pulse-value")).toHaveText(String(data.pulseScore));
  await expect(page.locator(".why-explanation")).toContainText("from " + data.topic.previous2h + " to " + data.topic.current2h);
  await expect(page.locator(".why-evidence-strip")).toContainText("Independent providers");
  await expect(page.locator(".topic-where")).toContainText(data.locationEvidence.mentionCount + " explicit mentions");
  await expect(page.locator(".snapshot-count")).toContainText("49 SNAPSHOTS · V2");
  await expect(page.locator(".lifecycle-timeline > li")).toHaveCount(4);
  await expect(page.locator(".lifecycle-timeline")).toContainText("Peak " + Math.max(...data.history.map((s: { pulseScore: number }) => s.pulseScore)));
  await page.screenshot({ path: ".cache/topic-editorial-desktop.png", fullPage: true });
  await page.getByText("View snapshot history as a table", { exact: true }).click();
  await expect(page.locator(".snapshot-table tbody tr")).toHaveCount(49);
  await page.getByRole("group", { name: "Snapshot chart metric" }).getByRole("button", { name: "Signals · 2H" }).click();
  await expect(page.locator(".snapshot-figure figcaption")).toContainText("Distinct signals in the two hours before each snapshot");
  for (const window of ["7D", "30D", "24H"]) {
    await page.getByRole("group", { name: "Snapshot history window" }).getByRole("button", { name: window, exact: true }).click();
    await expect(page.locator(".snapshot-table tbody tr")).toHaveCount(49);
  }
  await page.getByRole("group", { name: "Snapshot chart metric" }).getByRole("button", { name: "Pulse Score", exact: true }).click();
  await page.locator(".snapshot-plot").scrollIntoViewIfNeeded();
  const box = await page.locator(".snapshot-plot").boundingBox(); if (!box) throw new Error("Snapshot chart is missing");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await expect(page.locator(".snapshot-plot .recharts-tooltip-wrapper")).toBeVisible();
  expect(errors).toEqual([]);
});

test("provider filters, evidence expansion, original links, methodology and related context work", async ({ page }) => {
  await page.goto("/topic/namma-metro");
  const evidence = page.locator(".topic-evidence-section"), filters = page.getByRole("group", { name: "Evidence source" });
  await expect(evidence.locator(".topic-evidence-card")).toHaveCount(6);
  for (const provider of ["GDELT", "Bluesky", "Hacker News"]) {
    await filters.getByRole("button", { name: new RegExp("^" + provider) }).click();
    for (const row of await evidence.locator(".evidence-provider").all()) await expect(row).toHaveText(provider);
    await expect(evidence.locator(".evidence-read-status")).toContainText("Showing 6 of");
  }
  await filters.getByRole("button", { name: /^All sources/ }).click();
  await evidence.getByRole("button", { name: "Show 24 more items" }).click();
  await expect(evidence.locator(".topic-evidence-card")).toHaveCount(30);
  for (const link of await evidence.locator(".evidence-card-bottom a").all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toContainText("Open Example");
  }
  await evidence.getByRole("button", { name: "Show fewer items" }).click();
  await expect(evidence.locator(".topic-evidence-card")).toHaveCount(6);
  const disclosure = page.locator(".topic-methodology summary");
  await disclosure.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Behind the score" })).toBeVisible();
  await expect(page.locator(".methodology-factors")).toContainText("Velocity");
  await expect(page.locator(".methodology-factors")).toContainText("Source diversity");
  await expect(page.locator(".method-confidence")).toContainText("Cluster consistency");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await disclosure.click(); await expect(page.locator(".methodology-content")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Related signals" })).toBeVisible();
  await expect(page.locator(".related-signal-list li")).toHaveCount(4);
  await page.getByRole("button", { name: "Show 8 more related signals" }).click();
  await expect(page.locator(".related-signal-list li")).toHaveCount(12);
  for (const link of await page.locator(".related-signal-list a").all()) await expect(link).toHaveAttribute("href", /^https:\/\//);
});

test("cooling topics are explained honestly rather than presented as rising", async ({ page }) => {
  await page.goto("/topic/traffic-and-commutes");
  await expect(page.getByRole("heading", { name: "Why is this cooling?" })).toBeVisible();
  await expect(page.locator(".why-explanation")).toContainText("Attention is cooling");
  await expect(page.locator(".topic-pulse-block .lifecycle")).toHaveText("COOLING");
});

test("topic layouts, expanded data and long evidence remain accessible on desktop, tablet and mobile", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydrat|did not match|server rendered/i.test(message.text())) errors.push(message.text()); });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/topic/namma-metro");
    await expect(page.locator("h1")).toBeVisible();
    await page.getByText("How is the score calculated?", { exact: true }).click();
    await page.getByText("View snapshot history as a table", { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    if (width === 390) { await page.getByText("How is the score calculated?", { exact: true }).click(); await page.getByText("View snapshot history as a table", { exact: true }).click(); await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); }); await page.screenshot({ path: ".cache/topic-editorial-mobile.png", fullPage: true }); }
  }
  await page.goto("/topic/startup-ecosystem");
  await expect(page.getByRole("heading", { name: "The startup ecosystem", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("missing and invalid slugs have a useful archive state; storage failures can retry", async ({ page }) => {
  for (const slug of ["missing-topic", "invalid_slug"]) {
    await page.goto("/topic/" + slug);
    await expect(page.getByRole("heading", { name: "This topic isn't in the archive." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Read the methodology" })).toBeVisible();
  }
  await page.goto("http://127.0.0.1:3001/topic/namma-metro");
  await expect(page.getByRole("heading", { name: "This brief couldn't be loaded." })).toBeVisible();
  const retry = page.waitForResponse((r) => r.url().includes("/topic/namma-metro") && r.request().resourceType() === "fetch");
  await page.getByRole("button", { name: "Retry topic" }).click(); await retry;
  await expect(page.getByRole("button", { name: "Retry topic" })).toBeEnabled();
  await page.getByRole("link", { name: "Return to the pulse" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for a pulse" })).toBeVisible();
});
