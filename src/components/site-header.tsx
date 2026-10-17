"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SystemStatus } from "./system-status";
import { ArrowUpRight } from "lucide-react";
export function SiteHeader() {
  const path = usePathname();
  return <div className="masthead"><header className="site-header shell editorial-header">
    <Link href="/" className="wordmark" aria-label="Bengaluru Pulse home">
      <svg className="brand-symbol" viewBox="0 0 30 30" aria-hidden="true"><path d="M2 16h7l4-10 5 20 4-10h6" fill="none" stroke="currentColor" strokeWidth="2" /></svg><span className="wordmark-title">Bengaluru<span>Pulse<span className="wordmark-dot">.</span></span></span>
    </Link>
    <nav aria-label="Main navigation"><Link href="/" aria-current={path === "/" ? "page" : undefined}>Pulse</Link><Link href="/#explore">Explore</Link><Link href="/#city">Map</Link><Link href="/about" aria-current={path === "/about" ? "page" : undefined}>Methodology</Link></nav>
    <SystemStatus /><a className="header-github" href="https://github.com/icyshimakaze/bengaluru-internet-pulse" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight size={14} /><span className="sr-only"> (opens in a new tab)</span></a>
  </header></div>;
}
