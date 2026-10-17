"use client";
import Link from "next/link";
import { usePulseStatus } from "./pulse-context";
import { statusLabel } from "@/lib/trends/status-label";
import { formatDate, formatTime } from "@/lib/format";
export function SiteFooter({ contactEmail }: { contactEmail?: string }) {
  const { pulse, now } = usePulseStatus();
  return <footer className="site-footer shell editorial-footer"><div className="footer-signoff"><strong>Bengaluru Pulse<span className="wordmark-dot">.</span></strong><p>The city&apos;s public internet, measured in motion.</p></div>
    <nav aria-label="Footer navigation"><Link href="/about">About / Methodology</Link><Link href="/status" className="live-indicator"><span aria-hidden="true" className="signal-dot" />Status · {statusLabel(pulse, now)}</Link><a href="https://github.com/icyshimakaze/bengaluru-internet-pulse" target="_blank" rel="noopener noreferrer">GitHub ↗<span className="sr-only"> (opens in a new tab)</span></a><Link href="/about#sources">Sources</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>{contactEmail && <a href={`mailto:${contactEmail}`}>Contact</a>}</nav>
    <p className="footer-ingestion">{pulse.mode === "demo" ? "Demo edition" : "Last collected"}<br /><span>{pulse.lastSuccessfulIngestion ? `${formatDate(pulse.lastSuccessfulIngestion)} · ${formatTime(pulse.lastSuccessfulIngestion)} IST` : pulse.mode === "demo" ? "Fictional evidence · real scoring" : "Awaiting first collection"}</span></p>
  </footer>;
}
