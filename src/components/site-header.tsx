"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePulseStatus } from "./pulse-context";
import { isLive } from "@/lib/trends/dashboard-presentation";
export function SiteHeader() {
  const { pulse, now } = usePulseStatus(), live = isLive(pulse, now), path = usePathname();
  return <header className="site-header shell editorial-header">
    <Link href="/" className="wordmark" aria-label="Bengaluru Pulse home">
      <span className="wordmark-title">Bengaluru Pulse<span className="wordmark-dot">.</span></span>
    </Link>
    <nav aria-label="Main navigation"><Link href="/" aria-current={path === "/" ? "page" : undefined}>The pulse</Link><Link href="/about" aria-current={path === "/about" ? "page" : undefined}>Methodology</Link></nav>
    <div className={`live-indicator ${live ? "is-live" : "is-delayed"}`} title={pulse.mode === "demo" ? "Demo fixtures. No live ingestion has taken place." : "LIVE requires a successful ingestion within 45 minutes and a fresh readable snapshot."}>
      <span aria-hidden="true" className="signal-dot" /><span>{pulse.mode === "demo" ? "DEMO" : live ? "LIVE" : "DELAYED"}</span><span className="status-mode">{pulse.mode === "demo" ? "FICTIONAL DATA" : "PUBLIC SIGNALS"}</span>
    </div>
  </header>;
}
