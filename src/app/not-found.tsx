import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound() { return <section className="empty-state page-empty"><span className="eyebrow">404 / outside the pulse</span><h1>This topic isn&apos;t active.</h1><p>It may have cooled out of the current window, or the link may be incorrect.</p><Link href="/" className="text-link"><ArrowLeft size={14} aria-hidden="true" />Return to the pulse</Link></section>; }
