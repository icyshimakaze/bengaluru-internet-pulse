"use client";
import { MapPin, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { PublicHotspot, PublicTopic } from "@/lib/domain/read-models";
import { HotspotMapClient } from "./hotspot-map-client";
export function Hotspots({ hotspots, trends, window, mode }: { hotspots: PublicHotspot[]; trends: PublicTopic[]; window: string; mode: "demo" | "live" }) {
  return <section className="hotspots" aria-labelledby="hotspots-heading"><div className="section-heading"><h2 id="hotspots-heading">Around the city</h2><MapPin size={16} aria-hidden="true" /></div>
    <p className="section-description">Where the conversation is surfacing.</p><HotspotMapClient hotspots={hotspots} window={window} mode={mode} />
    <p className="map-note">Neighborhood mentions, not verified incident locations. Map tiles by OpenStreetMap.</p>
    <ol className="hotspot-list">{hotspots.map((h) => <li key={h.neighborhood}><div><strong>{h.neighborhood}</strong><span>{h.topics.map((slug) => trends.find((t) => t.slug === slug)?.title).filter(Boolean).join(" · ") || h.topTopic.title}</span></div><span className="mono">{h.count}</span></li>)}</ol>
    {!hotspots.length && <p className="empty-note">No explicit neighborhood mentions in the active evidence.</p>}
    <Link href="/about#locations" className="text-link">How locations are inferred <ArrowUpRight size={13} aria-hidden="true" /></Link>
  </section>;
}
