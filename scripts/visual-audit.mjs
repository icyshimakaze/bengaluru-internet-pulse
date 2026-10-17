import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const origin = process.argv[2] ?? "https://bengaluru-internet-pulse.vercel.app";
const edition = process.argv[3] ?? "before";
const output = `artifacts/${edition}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const measurements = [];
  for (const [width, height] of [[1920, 1080], [1600, 1000], [1440, 900], [1280, 800], [1024, 900], [768, 1024], [430, 932], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${output}/viewport-${width}.png`, animations: "disabled" });
    if (await page.locator(".momentum-chart").count()) {
      await page.locator(".momentum-chart").scrollIntoViewIfNeeded();
      await page.locator(".recharts-line-curve").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true, animations: "disabled" });
    measurements.push(await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      background: getComputedStyle(document.documentElement).backgroundColor,
      mainWidth: document.querySelector("main").getBoundingClientRect().width,
      overflow: [...document.querySelectorAll("main *")].filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8).map((element) => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })) })));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin, { waitUntil: "networkidle" });
  if (await page.getByRole("button", { name: /^System status:/ }).count()) {
    await Promise.all([page.waitForResponse((response) => new URL(response.url()).pathname === "/api/health"),
      page.getByRole("button", { name: /^System status:/ }).click()]);
    await page.getByRole("dialog").screenshot({ path: `${output}/system-status.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
  }
  if (await page.locator(".momentum-chart").count()) {
    await page.locator(".momentum-chart").scrollIntoViewIfNeeded();
    await page.locator(".recharts-line-curve").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle");
    await page.locator(".city-intelligence").screenshot({ path: `${output}/momentum-city.png`, animations: "disabled" });
  }
  await page.goto(`${origin}/about`);
  await page.screenshot({ path: `${output}/methodology.png`, fullPage: true });
  const response = await page.request.get(`${origin}/api/pulse?window=24h`);
  const pulse = await response.json();
  await writeFile(`${output}/pulse.json`, JSON.stringify(pulse, null, 2));
  const health = await page.request.get(`${origin}/api/health`);
  await writeFile(`${output}/health.json`, JSON.stringify(await health.json(), null, 2));
  if (pulse.topTopics[0]) {
    await page.goto(`${origin}/topic/${pulse.topTopics[0].slug}`, { waitUntil: "networkidle" });
    if (await page.locator(".snapshot-plot").count()) {
      await page.locator(".snapshot-plot").scrollIntoViewIfNeeded();
      await page.locator(".recharts-line-curve").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => scrollTo(0, 0));
    }
    await page.screenshot({ path: `${output}/topic.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${output}/topic-mobile.png`, fullPage: true });
    const social = await page.request.get(`${origin}/api/og/${pulse.topTopics[0].slug}`);
    if (social.ok() && social.headers()["content-type"]?.includes("image/png")) await writeFile(`${output}/topic-social.png`, await social.body());
  }
  await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify(measurements));
} finally { await browser.close(); }
