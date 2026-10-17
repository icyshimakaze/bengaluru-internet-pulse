import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceHealth } from "@/components/source-health";
import { demoReadState, projectDashboard } from "@/lib/server/projections";
import { healthSchema, type HealthData } from "@/lib/domain/read-models";
import { FIXTURE_NOW } from "@/fixtures/demo";

const timestamp = FIXTURE_NOW.toISOString();
const pulse = projectDashboard(demoReadState(FIXTURE_NOW), { window: "2h" }, FIXTURE_NOW);
const health = healthSchema.parse({
  status: "healthy", mode: "live", version: "v2", generatedAt: timestamp, stale: false,
  application: { status: "ok", checkedAt: timestamp }, database: { status: "ok", checkedAt: timestamp },
  lastIngestion: null, lastSuccessfulIngestion: timestamp,
  sources: pulse.sources.map((source) => ({ ...source, status: "ok", stale: false })),
  availableSources: ["gdelt", "bluesky", "hackernews"], recentSignalCount: 0, recentWindow: "24h", simulated: false,
});
const render = (data: HealthData) => renderToStaticMarkup(createElement(SourceHealth, { health: data }));

describe("compact source health", () => {
  it("reports completed empty collection as operational, with the actual timestamp in IST", () => {
    const html = render(health);
    expect(html.match(/>Live</g)).toHaveLength(3);
    expect(html).toContain(`dateTime="${timestamp}"`);
    expect(html).toContain("IST");
  });
  it("distinguishes failed, partial and stale coverage without green operational labels", () => {
    const html = render({ ...health, sources: health.sources.map((source, index) => ({ ...source,
      status: index === 0 ? "error" : index === 1 ? "partial" : "ok", stale: index !== 1,
      lastSuccessAt: index === 0 ? null : index === 1 ? timestamp : new Date(Date.parse(timestamp) - 91 * 60_000).toISOString() })) });
    expect(html).toContain("Error");
    expect(html).toContain("Degraded");
    expect(html).toContain("Stale");
    expect(html).not.toContain(">Live<");
  });
  it("never presents demo timestamps as successful live collection", () => {
    const html = render({ ...health, mode: "demo", simulated: true });
    expect(html).not.toContain("Operational");
    expect(html).not.toContain("<time");
    expect(html).toContain("No live collection in demo mode");
  });
  it("does not reuse operational source labels when the database cannot be read", () => {
    const html = render({ ...health, lastSuccessfulIngestion: null, database: { ...health.database, status: "unavailable" } });
    expect(html.match(/>Unavailable</g)).toHaveLength(3);
    expect(html).toContain("Temporarily unavailable");
    expect(html).not.toContain("Operational");
  });
});
