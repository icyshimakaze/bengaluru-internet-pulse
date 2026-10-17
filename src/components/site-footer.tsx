"use client";
import Link from "next/link";
import { usePulseMetadata } from "./pulse-context";
import { formatDate, formatTime } from "@/lib/format";
export function SiteFooter() {
  const pulse = usePulseMetadata();
  return <footer className="site-footer shell editorial-footer"><div className="footer-signoff"><strong>Bengaluru Pulse<span className="wordmark-dot">.</span></strong><p>The city&apos;s public internet, measured in motion.</p><small>Public signals are samples, not a census of Bengaluru.</small></div>
    <nav aria-label="Footer navigation"><Link href="/">Pulse</Link><Link href="/about">Methodology</Link><a href="https://github.com/icyshimakaze/bengaluru-internet-pulse" target="_blank" rel="noopener noreferrer">GitHub ↗<span className="sr-only"> (opens in a new tab)</span></a><Link href="/about#sources">Sources</Link></nav>
    <p className="footer-ingestion">{pulse.mode === "demo" ? "Demo edition" : "Last collected"}<br /><span>{pulse.lastSuccessfulIngestion ? `${formatDate(pulse.lastSuccessfulIngestion)} · ${formatTime(pulse.lastSuccessfulIngestion)} IST` : pulse.mode === "demo" ? "Fictional evidence · real scoring" : "Awaiting first collection"}</span></p>
  </footer>;
}
