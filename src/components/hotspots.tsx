"use client";
import dynamic from "next/dynamic";
import { MapPin, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { PublicHotspot, PublicTopic } from "@/lib/domain/read-models";
const Map = dynamic(() => import("./hotspot-map"), { ssr: false, loading: () => <div className="map-loading">Loading Bengaluru map…</div> });
export function Hotspots({ hotspots, trends }: { hotspots: PublicHotspot[]; trends: PublicTopic[] }) {
  return <section className="hotspots" aria-labelledby="hotspots-heading"><div className="section-heading"><h2 id="hotspots-heading">Around the city</h2><MapPin size={16} aria-hidden="true" /></div>
    <p className="section-description">Where the conversation is surfacing.</p><Map hotspots={hotspots} />
    <p className="map-note">Neighborhood mentions, not verified incident locations. Map tiles by OpenStreetMap.</p>
    <ol className="hotspot-list">{hotspots.map((h) => <li key={h.neighborhood}><div><strong>{h.neighborhood}</strong><span>{h.topics.map((slug) => trends.find((t) => t.slug === slug)?.title).filter(Boolean).join(" · ") || h.topTopic.title}</span></div><span className="mono">{h.count}</span></li>)}</ol>
    {!hotspots.length && <p className="empty-note">No explicit neighborhood mentions in the active evidence.</p>}
    <Link href="/about#locations" className="text-link">How locations are inferred <ArrowUpRight size={13} aria-hidden="true" /></Link>
  </section>;
}
