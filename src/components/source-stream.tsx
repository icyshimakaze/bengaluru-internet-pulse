"use client";
import { memo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LanguageBadge } from "./language-badge";
import { SourceAttribution } from "./source-attribution";
import { sourceNames } from "@/lib/domain/source-labels";
import type { DashboardData } from "@/lib/domain/read-models";
import { formatDate, formatTime } from "@/lib/format";
import { elapsedLabel } from "@/lib/trends/dashboard-presentation";
import { usePulseStatus } from "./pulse-context";

export const SourceStream = memo(function SourceStream({ pulse }: { pulse: DashboardData }) {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState("all");
  const { now } = usePulseStatus();
  const filtered = pulse.sourceStream.filter((signal) => kind === "all" || signal.sourceType === kind);
  const stream = filtered.slice(0, expanded ? 30 : 6);
  return <section id="stream" className="source-stream" aria-labelledby="stream-heading">
    <div className="editorial-section-heading"><div><div className="section-index mono">03 / THE EVIDENCE</div><h2 id="stream-heading">Source stream</h2><p>{pulse.mode === "demo" ? "Fictional demo evidence · original-source links are available for live observations." : "The public record. Follow any signal back to its source."}</p></div><span className="panel-overline mono">{pulse.signalCount} SIGNALS · {pulse.window.toUpperCase()}</span></div>
    <div className="stream-toolbar"><div className="stream-kind-controls" role="group" aria-label="Source stream type">{([["all", "All signals"], ["news", "News"], ["social", "Social"], ["tech", "Tech"]] as const).map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setExpanded(false); }}>{label}</button>)}</div><Link href="/about#sources" className="editorial-link">Source coverage <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
    <div className="stream-column-headings mono" aria-hidden="true"><span>TIME / IST</span><span>SOURCE</span><span>SIGNAL</span><span>LOCATION</span></div>
    <ol className="stream-list">{stream.map((signal) => <li key={signal.id}>
      <div className="stream-time"><time dateTime={signal.publishedAt} title={`${formatDate(signal.publishedAt)} · ${formatTime(signal.publishedAt)} IST · ${signal.timeKind}`}>{pulse.mode === "demo" ? formatTime(signal.publishedAt) : elapsedLabel(signal.publishedAt, now)}</time><span className="stream-time-kind">{signal.timeKind === "discovered" ? "Discovered" : "Published"}</span></div>
      <div className="stream-provenance"><span className={`stream-source-name provider-${signal.source}`}>{sourceNames[signal.source]}</span><span className="stream-type mono">{pulse.mode === "demo" ? "EXAMPLE" : signal.sourceType.toUpperCase()}</span></div>
      <div className="stream-evidence">{pulse.mode === "demo" ? <span className="demo-evidence-title">{signal.title}</span> : <a href={signal.url} target="_blank" rel="noopener noreferrer">{signal.title}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> · original source (opens in a new tab)</span></a>}<LanguageBadge language={signal.language} text={signal.title + " " + signal.excerpt} /><p>{signal.domain}{signal.enrichmentStatus !== "completed" ? " · Awaiting topic matching" : ""}</p>{pulse.mode === "live" && <SourceAttribution source={signal.source} />}</div>
      <div className="stream-location"><span>{signal.neighborhood ?? "Citywide / Unknown"}</span>{signal.topicSlug && <Link className="stream-topic-link" href={`/topic/${signal.topicSlug}`}>Topic brief ↗</Link>}</div>
    </li>)}</ol>
    {!stream.length && <div className="stream-empty"><p>No collected evidence in this selection.</p><span>{pulse.stale || pulse.status === "unavailable" || !pulse.availableSources.length ? "Source coverage is delayed or unavailable. See system status for the last successful collection." : "Try a wider window or another source type."}</span></div>}
    {filtered.length > 6 && <button className="stream-expand editorial-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer signals ↑" : "Show " + (filtered.length - 6) + " more signals ↓"}</button>}
    <div className="stream-source-health" aria-label="Source health">{pulse.sources.map((source) => <span key={source.source}><span className={`health-dot state-${source.healthState}`} aria-hidden="true" /><strong>{sourceNames[source.source]}</strong><span>{pulse.mode === "demo" ? "Demo" : source.healthState}</span></span>)}<Link href="/status">Collection details ↗</Link></div>
    <p className="stream-note">Repeated polls and syndicated copies are deduplicated.{pulse.streamTruncated ? " Latest 30 signals loaded; source-type filters apply to these rows." : ""}</p>
  </section>;
});
