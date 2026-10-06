import Link from "next/link";
import { Activity, ArrowUpRight, MapPin } from "lucide-react";
export function SiteHeader() {
  return <header className="site-header shell">
    <Link href="/" className="brand" aria-label="Bengaluru Pulse home"><Activity size={25} strokeWidth={1.7} aria-hidden="true" /><span>Bengaluru<span className="brand-light"> Pulse</span><span className="brand-period">.</span></span></Link>
    <nav aria-label="Main navigation"><Link href="/">The pulse</Link><Link href="/about">Methodology <ArrowUpRight size={13} aria-hidden="true" /></Link></nav>
    <span className="city-label"><MapPin size={13} aria-hidden="true" /> Bengaluru, IN</span>
  </header>;
}
