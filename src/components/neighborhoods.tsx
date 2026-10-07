"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { coordinates } from "@/lib/domain/schema";
import type { PublicHotspot } from "@/lib/domain/read-models";
const StreetMap = dynamic(() => import("./hotspot-map"), { ssr: false, loading: () => <div className="map-loading" role="status">Loading street map…</div> });
// Equirectangular projection of curated neighborhood centers. No invented city boundary.
const project = (lat: number, lng: number): [number, number] => [35 + (lng - 77.56) / 0.21 * 365, 240 - (lat - 12.84) / 0.27 * 205];
export function Neighborhoods({ hotspots, window, mode }: { hotspots: PublicHotspot[]; window: string; mode: "demo" | "live" }) {
  const [selection, setSelection] = useState(""), [showMap, setShowMap] = useState(false);
  const selected = hotspots.find((h) => h.neighborhood === selection) ?? hotspots[0];
  const total = hotspots.reduce((sum, h) => sum + h.activity, 0);
  return <section className="neighborhood-panel" aria-labelledby="neighborhood-heading"><div className="editorial-section-heading"><div><h2 id="neighborhood-heading">Across the city</h2><p>Neighborhoods in the conversation.</p></div><span className="panel-overline mono">{window.toUpperCase()} MENTIONS</span></div>
    <div className="neighborhood-plot"><svg viewBox="0 0 440 280" role="group" aria-label="Bengaluru neighborhood centers. Select a neighborhood to inspect its activity.">
      <g aria-hidden="true" className="geo-grid">{[80, 160, 240, 320, 400].map((x) => <path key={x} d={"M" + x + " 25V250"} />)}{[55, 115, 175, 235].map((y) => <path key={y} d={"M25 " + y + "H415"} />)}<text x="28" y="20">13.11° N</text><text x="28" y="267">12.84° N</text><text x="348" y="267">77.77° E</text><path d="M412 48V26m-4 5 4-5 4 5" className="north-arrow" /><text x="408" y="18">N</text></g>
      {Object.entries(coordinates).map(([name, [lat, lng]]) => {
        const [x, y] = project(lat, lng), hotspot = hotspots.find((h) => h.neighborhood === name), active = selected?.neighborhood === name;
        return <g key={name} className={"geo-point " + (hotspot ? "has-activity" : "") + (active ? " selected" : "")} transform={"translate(" + x + "," + y + ")"} role={hotspot ? "button" : undefined} tabIndex={hotspot ? 0 : undefined} aria-label={hotspot ? name + ": " + hotspot.activity + " signals. Select neighborhood." : undefined} aria-pressed={hotspot ? active : undefined} onClick={hotspot ? () => setSelection(name) : undefined} onKeyDown={hotspot ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelection(name); } } : undefined}>
          {hotspot && <circle className="geo-halo" r={Math.min(24, 9 + Math.sqrt(hotspot.activity) * 2)} />}<circle className="geo-center" r={hotspot ? 4 : 2} /><text x={x > 330 ? -10 : 10} y={name === "Indiranagar" ? -13 : name === "Whitefield" ? -14 : name === "MG Road" || name === "Marathahalli" ? 19 : 3} textAnchor={x > 330 ? "end" : "start"}>{name}</text>
        </g>;
      })}
    </svg><span className="plot-legend"><span className="legend-dot" /> {total} {mode === "demo" ? "fictional " : ""}explicit mentions · circle size = activity</span></div>
    {selected ? <><div className="neighborhood-selected" aria-live="polite"><div><span className="panel-overline">IN FOCUS</span><h3>{selected.neighborhood}</h3><Link href={"/topic/" + selected.topTopic.slug}>{selected.topTopic.title} ↗</Link></div><div className="neighborhood-numbers"><strong>{selected.activity}<small> signals</small></strong><span>Top pulse <b>{selected.topPulse}</b> · avg {selected.averagePulse}</span></div></div><div className="neighborhood-options" role="group" aria-label="Neighborhood activity">{hotspots.map((h) => <button key={h.neighborhood} aria-pressed={h.neighborhood === selected.neighborhood} onClick={() => setSelection(h.neighborhood)}><span>{h.neighborhood}</span><span className="mono">{h.activity}</span></button>)}</div></> : <p className="neighborhood-empty">No explicit neighborhood mentions in this window. Citywide and unknown locations are kept off the map.</p>}
    <p className="location-caveat">Neighborhood centers, not verified incident locations. <Link href="/about#locations">Location methodology ↗</Link></p>
    <details className="street-map-toggle" onToggle={(e) => setShowMap(e.currentTarget.open)}><summary>Open street map</summary>{showMap && <StreetMap hotspots={hotspots} />}</details>
  </section>;
}
