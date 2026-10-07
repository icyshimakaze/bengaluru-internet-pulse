"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { sourceNames } from "@/lib/domain/schema";
import type { DashboardData } from "@/lib/domain/read-models";
import { formatTime } from "@/lib/utils";
export function SourceStream({ pulse }: { pulse: DashboardData }) {
  const [expanded, setExpanded] = useState(false);
  const stream = pulse.sourceStream.slice(0, expanded ? 30 : 6);
  return <section className="source-stream" aria-labelledby="stream-heading"><div className="editorial-section-heading"><div><h2 id="stream-heading">Source stream</h2><p>{pulse.mode === "demo" ? "Fictional fixture evidence · example URLs, not real source reports." : "Latest public evidence · every link leads to its original source."}</p></div><span className="panel-overline mono">{pulse.signalCount} SIGNALS · {pulse.window.toUpperCase()}</span></div>
    <div className="stream-source-health" aria-label="Source health">{pulse.sources.map((s) => <span key={s.source}><span className={"health-dot " + (s.stale || !["ok", "partial"].includes(s.status) ? "health-muted" : "")} aria-hidden="true" /><strong>{sourceNames[s.source]}</strong><span>{s.stale ? "Stale" : s.status === "demo" ? "Demo" : s.status === "ok" ? "Available" : s.status === "partial" ? "Partial" : "Unavailable"}</span></span>)}<Link href="/about#sources">Coverage & limits ↗</Link></div>
    <ol className="stream-list">{stream.map((signal) => <li key={signal.id}><div className="stream-provenance"><span className="stream-source-name">{sourceNames[signal.source]}</span><time dateTime={signal.publishedAt}>{formatTime(signal.publishedAt)} IST</time><span className="stream-time-kind">{signal.timeKind === "discovered" ? "Discovered" : "Published"}</span></div><div className="stream-evidence"><a href={signal.url} target="_blank" rel="noopener noreferrer">{signal.title}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only">{pulse.mode === "demo" ? " · fictional example link" : " · original source"} (opens in a new tab)</span></a><p>{signal.domain} <span aria-hidden="true">·</span> {signal.neighborhood ?? "Citywide / Unknown"}{signal.enrichmentStatus !== "completed" ? " · Awaiting topic matching" : ""}</p></div><span className="stream-type mono">{pulse.mode === "demo" ? "EXAMPLE" : signal.sourceType.toUpperCase()}</span></li>)}</ol>
    {!stream.length && <div className="stream-empty"><p>No collected evidence in this selection.</p><span>Public source outages and quiet windows are shown honestly. Try a wider time window.</span></div>}
    {pulse.sourceStream.length > 6 && <button className="stream-expand editorial-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer signals ↑" : "Show " + (pulse.sourceStream.length - 6) + " more signals ↓"}</button>}
    <p className="stream-note">Repeated polls and syndicated copies are deduplicated.{pulse.streamTruncated ? " Showing the latest 30 signals." : ""} Public search is a sample of the city&apos;s conversation, not a census.</p>
  </section>;
}
