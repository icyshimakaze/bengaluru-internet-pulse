"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePulseStatus } from "./pulse-context";
import { isLive } from "@/lib/trends/dashboard-presentation";
export function SiteHeader() {
  const { pulse, now } = usePulseStatus(), live = isLive(pulse, now), path = usePathname();
  return <header className="site-header shell editorial-header">
    <Link href="/" className="wordmark" aria-label="Bengaluru Pulse home">
      <span className="wordmark-title"><svg width="25" height="23" viewBox="0 0 25 23" aria-hidden="true"><path d="M1 12h5l3-9 5 17 3-8h7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>BENGALURU PULSE<span className="wordmark-dot">.</span></span>
      <span className="wordmark-tagline">THE CITY&apos;S INTERNET, COMPRESSED INTO ONE PULSE.</span>
    </Link>
    <nav aria-label="Main navigation"><Link href="/" aria-current={path === "/" ? "page" : undefined}>The pulse</Link><Link href="/about" aria-current={path === "/about" ? "page" : undefined}>Methodology</Link></nav>
    <div className={`live-indicator ${live ? "is-live" : "is-delayed"}`} title={pulse.mode === "demo" ? "Demo fixtures. No live ingestion has taken place." : "LIVE requires a successful ingestion within 45 minutes and a fresh readable snapshot."}>
      <span aria-hidden="true" className="signal-dot" /><span>{live ? "LIVE" : "DELAYED"}</span><span className="status-mode">{pulse.mode === "demo" ? "DEMO" : "PUBLIC SIGNALS"}</span>
    </div>
  </header>;
}
