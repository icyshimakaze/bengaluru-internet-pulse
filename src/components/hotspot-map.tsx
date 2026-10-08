"use client";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import type { PublicHotspot } from "@/lib/domain/read-models";
import { activeHotspots, hotspotMarkerStyle } from "@/lib/trends/hotspot-presentation";

export type HotspotMapProps = { hotspots: PublicHotspot[]; window: string; mode: "demo" | "live";
  selectedNeighborhood?: string; onSelect?: (neighborhood: string) => void };

function MapViewport({ points }: { points: string }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().setAttribute("role", "group");
    map.getContainer().setAttribute("aria-label", "Interactive Bengaluru map. Arrow keys pan; plus and minus zoom. Focus markers for details.");
    const centers = points ? points.split(";").map((point) => point.split(",").map(Number) as [number, number]) : [];
    const fit = () => {
      if (centers.length) map.fitBounds(centers, { padding: [40, 40], maxZoom: 12, animate: false });
      else map.setView([12.98, 77.64], 11, { animate: false });
    };
    fit();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { map.invalidateSize({ pan: false, debounceMoveend: true }); fit(); });
    });
    observer.observe(map.getContainer());
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [map, points]);
  return null;
}

function HotspotDetails({ hotspot, window, link = false }: { hotspot: PublicHotspot; window: string; link?: boolean }) {
  return <div className="map-hotspot-details"><strong className="map-neighborhood-name">{hotspot.neighborhood}</strong>
    <p>{hotspot.activity} recent {hotspot.activity === 1 ? "signal" : "signals"} · {window.toUpperCase()}</p>
    <span className="map-topic-label">Top topic</span>
    {link ? <Link href={"/topic/" + hotspot.topTopic.slug}>{hotspot.topTopic.title} <span aria-hidden="true">↗</span></Link> : <span className="map-topic-title">{hotspot.topTopic.title}</span>}
    <p className="map-popup-score">Pulse Score <b>{hotspot.topPulse}</b><span> / 100</span></p>
  </div>;
}

function ActivityMarker({ hotspot, window, selected, onSelect }: { hotspot: PublicHotspot; window: string;
  selected: boolean; onSelect?: (neighborhood: string) => void }) {
  const marker = useRef<LeafletCircleMarker>(null), style = hotspotMarkerStyle(hotspot.activity, hotspot.topPulse);
  useEffect(() => {
    const layer = marker.current, element = layer?.getElement();
    if (!layer || !element) return;
    element.setAttribute("tabindex", "0"); element.setAttribute("role", "button");
    element.setAttribute("aria-label", `${hotspot.neighborhood}: ${hotspot.activity} recent signals in ${window}. Top topic ${hotspot.topTopic.title}. Pulse Score ${hotspot.topPulse}.`);
    element.setAttribute("aria-pressed", String(selected));
    const keydown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); layer.closeTooltip(); layer.openPopup(); onSelect?.(hotspot.neighborhood); }
      if (event.key === "Escape") { layer.closePopup(); layer.closeTooltip(); }
    };
    const focus = () => layer.openTooltip(), blur = () => layer.closeTooltip();
    element.addEventListener("keydown", keydown); element.addEventListener("focus", focus); element.addEventListener("blur", blur);
    return () => { element.removeEventListener("keydown", keydown); element.removeEventListener("focus", focus); element.removeEventListener("blur", blur); };
  }, [hotspot, window, selected, onSelect]);
  useEffect(() => { if (selected) marker.current?.openPopup(); else marker.current?.closePopup(); }, [selected]);
  return <CircleMarker ref={marker} className="hotspot-activity-marker" center={[hotspot.lat, hotspot.lng]} radius={style.radius}
    pathOptions={{ ...style, weight: style.weight + (selected ? 1 : 0) }}
    eventHandlers={{ click: () => { marker.current?.closeTooltip(); onSelect?.(hotspot.neighborhood); } }}>
    <Tooltip direction="top" offset={[0, -style.radius]} opacity={1} className="hotspot-tooltip"><HotspotDetails hotspot={hotspot} window={window} /></Tooltip>
    <Popup minWidth={180} maxWidth={230} autoPanPadding={[24, 24]}><HotspotDetails hotspot={hotspot} window={window} link /></Popup>
  </CircleMarker>;
}

export default function HotspotMap({ hotspots, window, mode, selectedNeighborhood, onSelect }: HotspotMapProps) {
  const active = useMemo(() => activeHotspots(hotspots), [hotspots]);
  const points = active.map((h) => h.lat + "," + h.lng).sort().join(";");
  const [tilesUnavailable, setTilesUnavailable] = useState(false), [attempt, setAttempt] = useState(0);
  const tileErrors = useRef(0);
  return <div className="map-frame hotspot-street-map" role="region" aria-label="Bengaluru neighborhood activity street map">
    <p className="map-reading-guide">Size = recent activity · deeper green = top Pulse Score{mode === "demo" ? " · fictional demo activity" : ""}. Scores use the latest 2H.</p>
    <MapContainer center={[12.98, 77.64]} zoom={11} minZoom={9} maxZoom={16} scrollWheelZoom={false}
      zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false} className="hotspot-map">
      <TileLayer key={attempt} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ loading: () => { tileErrors.current = 0; },
          tileerror: () => { tileErrors.current++; setTilesUnavailable(true); }, load: () => setTilesUnavailable(tileErrors.current > 0) }} />
      <MapViewport points={points} />
      {active.map((hotspot) => <ActivityMarker key={hotspot.neighborhood} hotspot={hotspot} window={window}
        selected={selectedNeighborhood === hotspot.neighborhood} onSelect={onSelect} />)}
    </MapContainer>
    {tilesUnavailable && <div className="map-fallback"><p role="status">Base map tiles unavailable. Activity markers and neighborhood counts remain available.</p><button className="editorial-link" onClick={() => { tileErrors.current = 0; setTilesUnavailable(false); setAttempt(attempt + 1); }}>Retry base map</button></div>}
    {!active.length && <p className="map-empty" role="status">No neighborhood activity in this window. Citywide and unknown locations have no markers.</p>}
    <p className="map-interaction-note">Hover, click or focus a marker for evidence counts. Press Enter for topic details. Coordinates are approximate neighborhood centers.</p>
  </div>;
}
