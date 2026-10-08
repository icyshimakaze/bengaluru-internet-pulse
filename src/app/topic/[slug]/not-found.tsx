import Link from "next/link";
export default function TopicNotFound() {
  return <section className="topic-recovery topic-not-found"><span className="editorial-eyebrow">404 / OUTSIDE THE ARCHIVE</span><h1>This topic isn&apos;t in the archive.</h1><p>The link may be incorrect, or its retained topic record may no longer be available. Cooling topics remain accessible while their history is retained.</p><Link className="editorial-link" href="/">Return to the pulse ↗</Link><Link className="editorial-link" href="/about">Read the methodology ↗</Link></section>;
}
