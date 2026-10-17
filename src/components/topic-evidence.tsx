"use client";
import { useState } from "react";
import type { TopicEvidenceLink } from "@/lib/trends/topic-presentation";
import { SourceAttribution } from "./source-attribution";
import { sourceNames, sources } from "@/lib/domain/source-labels";
import type { Source } from "@/lib/domain/schema";
import { formatDate, formatTime } from "@/lib/format";

function EvidenceCard({ signal, mode }: { signal: TopicEvidenceLink; mode: "demo" | "live" }) {
  return <li className="topic-evidence-card"><div className="evidence-card-top"><span className="evidence-provider">{sourceNames[signal.source]}</span><span className="mono evidence-card-kind">{mode === "demo" ? "FICTIONAL EXAMPLE" : signal.sourceType.toUpperCase()}</span></div><h3>{signal.title}</h3><p className="evidence-card-domain">{signal.domain}{mode === "live" && <SourceAttribution source={signal.source} />}</p><div className="evidence-card-bottom"><span><time dateTime={signal.publishedAt}>{formatDate(signal.publishedAt)} · {formatTime(signal.publishedAt)} IST</time><small>{signal.timeKind === "discovered" ? "Discovered by source" : "Published by source"}</small></span>{mode === "demo" ? <span className="demo-evidence-note">Fictional example · no original article</span> : <a href={signal.url} target="_blank" rel="noopener noreferrer">Open Original <span aria-hidden="true">→</span><span className="sr-only">: {signal.title} (opens in a new tab)</span></a>}</div></li>;
}
export function TopicEvidence({ evidence, mode, total, truncated }: {
  evidence: TopicEvidenceLink[]; mode: "demo" | "live"; total: number; truncated: boolean;
}) {
  const [source, setSource] = useState<Source | "">(""), [expanded, setExpanded] = useState(false);
  const selected = evidence.filter((s) => !source || s.source === source), visible = selected.slice(0, expanded ? 30 : 6);
  return <>
    <section className="topic-evidence-section" aria-labelledby="topic-evidence-heading">
      <div className="editorial-section-heading"><div><h2 id="topic-evidence-heading">Source evidence</h2><p>{mode === "demo" ? "Fictional demo evidence · no original articles or posts." : "Titles and provenance, with links to the original reports and posts."}</p></div><span className="panel-overline mono">{total} DISTINCT SIGNALS · 24H</span></div>
      <div className="evidence-source-controls" role="group" aria-label="Evidence source"><button aria-pressed={source === ""} onClick={() => { setSource(""); setExpanded(false); }}>All sources <span>{evidence.length}</span></button>{sources.filter((s) => s !== "currents" || evidence.some((item) => item.source === s)).map((s) => <button key={s} aria-pressed={source === s} onClick={() => { setSource(s); setExpanded(false); }}>{sourceNames[s]} <span>{evidence.filter((e) => e.source === s).length}</span></button>)}</div>
      <p className="evidence-read-status" role="status">{selected.length ? "Showing " + visible.length + " of " + selected.length + " loaded source items." : "No loaded evidence from this source."}</p>
      <ol className="topic-evidence-grid">{visible.map((signal) => <EvidenceCard key={signal.id} signal={signal} mode={mode} />)}</ol>
      {!visible.length && <div className="evidence-no-data"><h3>{evidence.length ? "No evidence from this provider." : "No recent source evidence."}</h3><p>{evidence.length ? "Choose another source to inspect the retained evidence." : "No distinct source items were observed in the last 24 hours. Older snapshot history can still be explored above."}</p></div>}
      {selected.length > 6 && <button className="editorial-link evidence-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer items ↑" : "Show " + (selected.length - 6) + " more items ↓"}</button>}
      <p className="evidence-provenance-note">{mode === "demo" ? "Fictional titles demonstrate the evidence view; there are no original articles or posts." : "Titles only; full articles and posts remain at their original sources. GDELT timestamps indicate discovery."}{truncated ? " Only the 30 most recent source items are loaded; counts above include all deduplicated evidence." : ""} Filter counts refer to loaded items.</p>
    </section>

  </>;
}

export function RelatedSignals({ related, mode }: { related: TopicEvidenceLink[]; mode: "demo" | "live" }) {
  const [expanded, setExpanded] = useState(false);
  const visible = related.slice(0, expanded ? 12 : 4);
  return (
    <section className="topic-related" aria-labelledby="related-signals-heading"><div className="editorial-section-heading"><div><h2 id="related-signals-heading">Related signals</h2><p>Other topics sharing a category or explicitly mentioned neighborhood.</p></div><span className="panel-overline mono">CONTEXT, NOT EQUIVALENCE</span></div>{related.length ? <ol className="related-signal-list">{visible.map((signal) => <li key={signal.id}><span className="related-provider">{sourceNames[signal.source]}</span><div>{mode === "demo" ? <span className="demo-evidence-title">{signal.title}</span> : <a href={signal.url} target="_blank" rel="noopener noreferrer">{signal.title} <span aria-hidden="true">↗</span><span className="sr-only"> · original source (opens in a new tab)</span></a>}<p>{signal.domain} · <time dateTime={signal.publishedAt}>{formatDate(signal.publishedAt)} · {formatTime(signal.publishedAt)} IST</time>{signal.timeKind === "discovered" ? " · discovered" : ""}</p>{mode === "live" && <SourceAttribution source={signal.source} />}</div></li>)}</ol> : <p className="related-empty">No related source items in the retained evidence. Connections are shown only when metadata supports them.</p>}{related.length > 4 && <button className="editorial-link related-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer related signals" : "Show " + (related.length - 4) + " more related signals"}</button>}</section>
  );
}
