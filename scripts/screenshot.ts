import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser } from "@playwright/test";
import { z } from "zod";
import { dashboardSchema } from "../src/lib/domain/read-models";

const port = z.coerce.number().int().min(1024).max(65535).parse(process.env.SCREENSHOT_PORT ?? 4329);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  windowsHide: true, stdio: "ignore", env: { ...process.env, APP_DATA_MODE: "demo", TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "",
    ENRICHMENT_PROVIDER: "heuristic", OPENAI_API_KEY: "", XKIRO_API_KEY: "", CURRENTS_API_KEY: "", RSS_ENABLED: "false", CONTACT_EMAIL: "" },
});
let browser: Browser | undefined, serverError = false;
server.on("error", () => { serverError = true; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (serverError || server.exitCode !== null) throw new Error("SCREENSHOT_SERVER_FAILED");
    try {
      const response = await fetch(`${origin}/api/pulse`, { signal: AbortSignal.timeout(1000) });
      const model = dashboardSchema.parse(await response.json());
      if (response.ok && model.mode === "demo") { ready = true; break; }
    } catch { /* Wait for this newly started production server. */ }
    await delay(250);
  }
  if (!ready) throw new Error("SCREENSHOT_SERVER_TIMEOUT");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  mkdirSync("docs/images", { recursive: true });
  for (const [path, name] of [["/", "homepage"], ["/topic/namma-metro", "topic"]] as const) {
    await page.setViewportSize({ width: 1440, height: name === "homepage" ? 1100 : 1560 });
    await page.goto(origin + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (name === "homepage") await page.locator(".lead-topic h3").waitFor();
    else {
      await page.locator(".snapshot-plot").scrollIntoViewIfNeeded();
      await page.locator(".snapshot-plot .recharts-line-curve").first().waitFor();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForFunction(() => scrollY === 0);
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("SCREENSHOT_OVERFLOW");
    const masthead = await page.getByRole("banner").boundingBox();
    if (!masthead || masthead.y < 0 || masthead.y > 1) throw new Error("SCREENSHOT_MASTHEAD_CLIPPED");
    await page.screenshot({ path: `docs/images/${name}.png`, fullPage: false, animations: "disabled" });
  }
  if (errors.length) throw new Error("SCREENSHOT_RUNTIME_ERROR");
  writeFileSync("docs/images/README.md", "# Reproducible screenshots\n\nCaptured from the actual local production build in explicitly fictional demo mode: homepage 1440 x 1100, topic 1440 x 1560. No live evidence or benchmark result is depicted.\n\nRun `npm run build`, then `npm run screenshot` (Chromium must be installed via `npx playwright install chromium`). The script starts/stops its own demo-only server, checks the public model, overflow and masthead position, waits for fonts and the topic chart, and records the real rendered pages without image generation.\n");
  console.info(JSON.stringify({ event: "screenshots.completed", mode: "demo", fictional: true, files: ["docs/images/homepage.png", "docs/images/topic.png"] }));
} catch {
  console.error(JSON.stringify({ event: "screenshots.failed", code: "SCREENSHOT_CAPTURE_FAILED" })); process.exitCode = 1;
} finally { await browser?.close(); server.kill(); }
