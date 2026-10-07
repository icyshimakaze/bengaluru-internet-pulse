"use client";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { useState } from "react";
import type { Hotspot } from "@/lib/domain/schema";
export default function HotspotMap({ hotspots }: { hotspots: Hotspot[] }) {
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  return <div className="map-frame"><MapContainer center={[12.98, 77.64]} zoom={10} scrollWheelZoom={false} className="hotspot-map" aria-label="Map of neighborhood mentions in Bengaluru">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTilesUnavailable(true) }} />
    {hotspots.map((h) => <CircleMarker key={h.neighborhood} center={[h.lat, h.lng]} radius={6 + Math.sqrt(h.count) * 1.7} pathOptions={{ color: "#11684f", fillColor: "#11684f", fillOpacity: 0.3, weight: 1.5 }}><Popup><strong>{h.neighborhood}</strong><br />{h.count} distinct neighborhood mentions<br />{h.topics.length} topics</Popup></CircleMarker>)}
  </MapContainer>{tilesUnavailable && <p className="map-fallback" role="status">Base map tiles unavailable. Neighborhood counts remain available in the list.</p>}</div>;
}
