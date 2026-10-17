import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { coordinates, neighborhoods } from "@/lib/domain/schema";
import { activeHotspots, hotspotMarkerStyle } from "@/lib/trends/hotspot-presentation";
import { demoReadState, projectDashboard } from "@/lib/server/projections";
import { FIXTURE_NOW } from "@/fixtures/demo";
import type { PublicHotspot } from "@/lib/domain/read-models";
import { HotspotMapClient } from "@/components/hotspot-map-client";
import { Neighborhoods } from "@/components/neighborhoods";
// These factories fail if a server render evaluates either browser-only dependency.
vi.mock("leaflet", () => { throw new Error("Leaflet was evaluated during SSR"); });
vi.mock("react-leaflet", () => { throw new Error("React Leaflet was evaluated during SSR"); });
const fixture = () => projectDashboard(demoReadState(FIXTURE_NOW), { window: "2h" }, FIXTURE_NOW);

describe("curated hotspot presentation", () => {
  it("covers only supported neighborhoods with approximate Bengaluru centers", () => {
    expect(Object.keys(coordinates).every((name) => (neighborhoods as readonly string[]).includes(name))).toBe(true);
    expect(Object.hasOwn(coordinates, "MG Road")).toBe(false);
    for (const [lat, lng] of Object.values(coordinates)) {
      expect(lat).toBeGreaterThan(12.8); expect(lat).toBeLessThan(13.2);
      expect(lng).toBeGreaterThan(77.5); expect(lng).toBeLessThan(77.8);
    }
    expect(Object.hasOwn(coordinates, "Citywide")).toBe(false);
    expect(Object.hasOwn(coordinates, "Unknown")).toBe(false);
  });
  it("omits zero activity and unsupported places, without trusting incoming coordinates", () => {
    const h = fixture().hotspots[0]!;
    expect(activeHotspots([{ ...h, activity: 0 }])).toEqual([]);
    expect(activeHotspots([{ ...h, neighborhood: "Citywide" } as unknown as PublicHotspot,
      { ...h, neighborhood: "Unknown" } as unknown as PublicHotspot])).toEqual([]);
    expect(activeHotspots([{ ...h, lat: 0, lng: 0 }])[0]).toMatchObject({ lat: coordinates[h.neighborhood]![0], lng: coordinates[h.neighborhood]![1] });
    expect(h.lat).not.toBe(0);
  });
  it("encodes activity with bounded size and intensity independently with opacity", () => {
    const quiet = hotspotMarkerStyle(1, 90), active = hotspotMarkerStyle(16, 90), intense = hotspotMarkerStyle(16, 100);
    expect(active.radius).toBeGreaterThan(quiet.radius);
    expect(active.fillOpacity).toBe(quiet.fillOpacity);
    expect(intense.radius).toBe(active.radius);
    expect(intense.fillOpacity).toBeGreaterThan(active.fillOpacity);
    expect(intense.weight).toBeGreaterThan(active.weight);
    expect(hotspotMarkerStyle(1_000_000, 100).radius).toBe(24);
    expect(hotspotMarkerStyle(NaN, Infinity)).toEqual(hotspotMarkerStyle(0, 0));
  });
});

describe("hotspot aggregation", () => {
  it("keeps deduplicated signal counts, deterministic top topics and all-provider scores", () => {
    const state = demoReadState(FIXTURE_NOW), original = projectDashboard(state, { window: "2h" }, FIXTURE_NOW);
    const repeated = projectDashboard({ ...state, items: [...state.items, ...state.items.map((i) => ({ ...i, id: "poll-" + i.id }))] }, { window: "2h" }, FIXTURE_NOW);
    expect(repeated.hotspots).toEqual(original.hotspots);
    for (const h of original.hotspots) {
      expect(h.activity).toBeGreaterThan(0); expect(h.activity).toBe(h.count);
      expect(h.topPulse).toBe(h.topTopic.pulseScore);
      expect(h.topPulse).toBe(original.topTopics.find((t) => t.slug === h.topTopic.slug)!.score);
    }
    const social = projectDashboard(state, { window: "2h", source: "bluesky" }, FIXTURE_NOW);
    for (const h of social.hotspots) {
      expect(h.activity).toBeLessThanOrEqual(original.hotspots.find((p) => p.neighborhood === h.neighborhood)!.activity);
      expect(h.topPulse).toBe(original.topTopics.find((t) => t.slug === h.topTopic.slug)!.score);
    }
  });
  it("does not infer markers from a topic location when source signals are citywide", () => {
    const state = demoReadState(FIXTURE_NOW);
    const data = projectDashboard({ ...state, topics: state.topics.map((t) => ({ ...t, neighborhood: "Whitefield" as const })),
      items: state.items.map((i) => ({ ...i, neighborhood: null })) }, { window: "24h" }, FIXTURE_NOW);
    expect(data.topTopics.length).toBeGreaterThan(0); expect(data.hotspots).toEqual([]);
    expect(projectDashboard({ ...state, items: [] }, { window: "2h" }, FIXTURE_NOW).hotspots).toEqual([]);
  });
});

describe("Leaflet server/client boundary", () => {
  it("renders the dynamic fallback with no window, document or browser-only imports", () => {
    expect(typeof globalThis.window).toBe("undefined"); expect(typeof globalThis.document).toBe("undefined");
    const html = renderToStaticMarkup(createElement(HotspotMapClient, { hotspots: fixture().hotspots, window: "2h", mode: "demo" }));
    expect(html).toContain("Loading Bengaluru street map"); expect(html).not.toContain("leaflet-container");
  });
  it("server-renders accessible evidence and no empty neighborhood markers", () => {
    const h = fixture().hotspots[0]!;
    const html = renderToStaticMarkup(createElement(Neighborhoods, { hotspots: [{ ...h, activity: 0 }], window: "2h", mode: "live" }));
    expect(html).toContain("No explicit neighborhood mentions"); expect(html).not.toContain("geo-point");
    expect(html).not.toContain("leaflet-container"); expect(html).not.toContain("<h3>" + h.neighborhood + "</h3>");
  });
});
