import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";

// Measure an explicitly started local production server; never call a model or source API.
const origin = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
}, "Use the origin of a local production server").parse(process.argv[2] ?? "http://127.0.0.1:4320");
const browser = await chromium.launch();
const measurements = {};
try {
  for (const path of ["/", "/topic/namma-metro", "/about"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await context.newPage(), assets = [], pending = [];
    page.on("response", (response) => {
      if (response.request().resourceType() !== "script" || !response.url().includes("/_next/")) return;
      pending.push(response.body().then((body) => assets.push({ bytes: body.length, gzip: gzipSync(body).length,
        chart: body.includes("recharts-wrapper"), map: body.includes("leaflet-pane") })));
    });
    await page.goto(new URL(path, origin).href);
    await page.waitForLoadState("networkidle"); await Promise.all(pending);
    measurements[path] = { scripts: assets.length, jsBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
      jsGzip: assets.reduce((sum, asset) => sum + asset.gzip, 0), chartChunks: assets.filter((asset) => asset.chart).length,
      mapChunks: assets.filter((asset) => asset.map).length };
    await context.close();
  }
  for (const path of ["/api/pulse", "/api/topics/namma-metro", "/api/hotspots"]) {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Read measurement failed: ${path} (${response.status})`);
    const body = await response.text();
    measurements[path] = { jsonBytes: Buffer.byteLength(body), gzip: gzipSync(body).length };
  }
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/performance-current.json", JSON.stringify(measurements, null, 2) + "\n");
  console.log(JSON.stringify(measurements, null, 2));
} finally { await browser.close(); }
