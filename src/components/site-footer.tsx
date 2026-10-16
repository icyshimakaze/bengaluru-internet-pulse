"use client";
import Link from "next/link";
import { usePulseMetadata } from "./pulse-context";
import { formatDate, formatTime } from "@/lib/format";
export function SiteFooter() {
  const pulse = usePulseMetadata();
  return <footer className="site-footer shell editorial-footer"><div className="footer-signoff"><strong>Bengaluru Pulse</strong><p>Public signals. Measured momentum.</p></div>
    <nav aria-label="Footer navigation"><Link href="/about">Methodology</Link><a href="https://github.com/icyshimakaze/bengaluru-internet-pulse" target="_blank" rel="noopener noreferrer">GitHub ↗</a><Link href="/about#sources">Sources</Link></nav>
    <p className="footer-ingestion">{pulse.mode === "demo" ? "Demo edition" : "Last collected"}<br /><span>{pulse.lastSuccessfulIngestion ? `${formatDate(pulse.lastSuccessfulIngestion)} · ${formatTime(pulse.lastSuccessfulIngestion)} IST` : pulse.mode === "demo" ? "Fictional evidence · real scoring" : "Awaiting first collection"}</span></p>
  </footer>;
}
