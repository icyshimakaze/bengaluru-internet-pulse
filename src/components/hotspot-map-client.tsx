"use client";
import dynamic from "next/dynamic";
import type { HotspotMapProps } from "./hotspot-map";

// Leaflet evaluates browser APIs at import time. Every caller must go through this boundary.
const Map = dynamic(() => import("./hotspot-map"), { ssr: false,
  loading: () => <div className="map-loading" role="status">Loading Bengaluru street map…</div> });
export function HotspotMapClient(props: HotspotMapProps) { return <Map {...props} />; }
