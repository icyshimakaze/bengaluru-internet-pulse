"use client";
import Link from "next/link";
import { usePulseStatus } from "./pulse-context";
import { formatDate, formatTime } from "@/lib/utils";
export function SiteFooter() {
  const { pulse } = usePulseStatus();
  return <footer className="site-footer shell editorial-footer"><div className="footer-signoff"><strong>BENGALURU PULSE</strong><p>A city in motion. A signal worth understanding.</p></div>
    <nav aria-label="Footer navigation"><Link href="/about">Methodology</Link><a href="https://github.com/icyshimakaze/bengaluru-internet-pulse" target="_blank" rel="noopener noreferrer">GitHub ↗</a><Link href="/about#sources">Sources</Link></nav>
    <p className="footer-ingestion">Last successful ingestion<br /><span>{pulse.lastSuccessfulIngestion ? `${formatDate(pulse.lastSuccessfulIngestion)} · ${formatTime(pulse.lastSuccessfulIngestion)} IST` : pulse.mode === "demo" ? "None · fictional demo data" : "Awaiting first successful run"}</span></p>
  </footer>;
}
