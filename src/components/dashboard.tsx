"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { sourceNames, sources } from "@/lib/domain/schema";
import { dashboardSchema, type DashboardData, type PublicTopic, type ReadQuery, type TopicDetailData } from "@/lib/domain/read-models";
import { categoryLabels, filterCategories, elapsedLabel } from "@/lib/trends/dashboard-presentation";
import { formatChange } from "@/lib/trends/presentation";
import { formatDate, formatTime } from "@/lib/utils";
import { Sparkline } from "./charts";
import { MomentumChart } from "./momentum-chart";
import { Neighborhoods } from "./neighborhoods";
import { SourceStream } from "./source-stream";
import { usePulseStatus } from "./pulse-context";

function TopicMeta({ topic }: { topic: PublicTopic }) {
  return <div className="topic-kicker"><span>{categoryLabels[topic.semanticCategory]}</span><span aria-hidden="true">/</span><span>{topic.neighborhood ?? "Citywide / Unknown"}</span><span className={"lifecycle lifecycle-" + topic.lifecycle.toLowerCase()}>{topic.lifecycle}</span></div>;
}
function Change({ topic }: { topic: PublicTopic }) {
  return <span className={topic.growthPercent > 0 ? "growth-positive" : "growth-other"} title="Change vs previous 2h. Baseline floor: 3 signals; positive change capped at 300%.">{formatChange(topic)}</span>;
}
function LeadTopic({ topic, rank, window }: { topic: PublicTopic; rank: number; window: ReadQuery["window"] }) {
  return <article className="lead-topic trend-entry">
    <div className="lead-overline"><span className="mono">NO. {String(rank).padStart(2, "0")}</span><span>THE STRONGEST PULSE</span></div>
    <TopicMeta topic={topic} />
    <h3><Link href={"/topic/" + topic.slug}>{topic.title}<ArrowUpRight size={27} strokeWidth={1.3} aria-hidden="true" /></Link></h3>
    <p className="lead-description">{topic.description}</p>
    <div className="lead-scoreline"><div className="lead-score"><strong>{topic.score}</strong><span>PULSE SCORE <span className="muted">/ 100</span></span></div><div className="lead-change"><Change topic={topic} /><span>vs previous 2h</span></div></div>
    <dl className="lead-evidence"><div><dt>Signals · {window.toUpperCase()}</dt><dd>{topic.activityCount}</dd></div><div><dt>Sources · 2H</dt><dd>{topic.sourceCount}<small> / 3</small></dd></div><div><dt>Confidence</dt><dd>{Math.round(topic.confidence * 100)}<small>%</small></dd></div></dl>
    <p className="lead-providers">{topic.sources.map((s) => sourceNames[s]).join(" · ")}<span>{topic.confidenceLabel} confidence</span></p>
    <Link href={"/topic/" + topic.slug} className="editorial-link">Follow the evidence <ArrowUpRight size={14} aria-hidden="true" /></Link>
  </article>;
}
function SecondaryTopic({ topic, rank, window }: { topic: PublicTopic; rank: number; window: ReadQuery["window"] }) {
  return <li className="secondary-topic trend-entry"><span className="secondary-rank mono">{String(rank).padStart(2, "0")}</span><div className="secondary-copy"><TopicMeta topic={topic} /><h3><Link href={"/topic/" + topic.slug}>{topic.title} <ArrowUpRight size={14} aria-hidden="true" /></Link></h3><p>{topic.activityCount} signals · {window.toUpperCase()} <span> / </span>{topic.sourceCount} sources · 2H <span> / </span>{Math.round(topic.confidence * 100)}% confidence</p></div><div className="secondary-spark"><Sparkline width={85} history={topic.history} cooling={topic.lifecycle === "COOLING"} /><span>24h signals</span></div><div className="secondary-score"><strong>{topic.score}<span className="sr-only"> Pulse Score out of 100</span></strong><Change topic={topic} /></div></li>;
}
export function Dashboard({ initialPulse, initialDetail }: { initialPulse: DashboardData; initialDetail: TopicDetailData | null }) {
  const [pulse, setPulse] = useState(initialPulse), [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ReadQuery>({ window: initialPulse.window });
  const [refreshing, setRefreshing] = useState(false), [error, setError] = useState("");
  const { now, publish } = usePulseStatus();
  const controller = useRef<AbortController | null>(null), requestId = useRef(0);
  const applied = useRef<ReadQuery>({ window: initialPulse.window, category: initialPulse.filters.category ?? undefined, source: initialPulse.filters.source ?? undefined });
  const refresh = useCallback(async (next: ReadQuery) => {
    const id = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const deadline = setTimeout(() => abort.abort(), 10_000);
    setRefreshing(true); setError("");
    try {
      const params = new URLSearchParams({ window: next.window });
      if (next.category) params.set("category", next.category);
      if (next.source) params.set("source", next.source);
      const response = await fetch("/api/pulse?" + params, { signal: abort.signal, cache: "no-store" });
      // An unavailable read still returns a validated, honest empty model.
      if (!response.ok && response.status !== 503) throw new Error("READ_FAILED");
      const data = dashboardSchema.parse(await response.json());
      if (data.window !== next.window || data.filters.category !== (next.category ?? null) || data.filters.source !== (next.source ?? null)) throw new Error("QUERY_MISMATCH");
      if (id === requestId.current) { applied.current = next; setPulse(data); publish(data); }
    } catch {
      if (id === requestId.current) { setFilters(applied.current); setError("The latest read could not be loaded. The displayed snapshot and filters are unchanged."); }
    } finally { clearTimeout(deadline); if (id === requestId.current) setRefreshing(false); }
  }, [publish]);
  useEffect(() => {
    if (pulse.mode !== "live") return;
    const timer = setInterval(() => { void refresh(filters); }, 60_000);
    return () => clearInterval(timer);
  }, [pulse.mode, filters, refresh]);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, []);
  const changeFilters = (next: ReadQuery) => { setFilters(next); void refresh(next); };
  const clearFilters = () => { setQuery(""); changeFilters({ window: filters.window }); };
  const shown = pulse.topTopics.filter((t) => (t.title + " " + t.description + " " + (t.neighborhood ?? "")).toLowerCase().includes(query.trim().toLowerCase()));
  const lead = shown[0], rest = shown.slice(1);
  const mismatched = filters.window !== pulse.window || (filters.category ?? null) !== pulse.filters.category || (filters.source ?? null) !== pulse.filters.source;
  return <div className="pulse-home">
    <section className="pulse-hero" aria-labelledby="hero-heading">
      <div className="hero-main"><div className="editorial-eyebrow"><span>BENGALURU, INDIA</span><span className="hero-edition">{formatDate(pulse.evaluatedAt)} · IST</span></div><h1 id="hero-heading">What is suddenly<br className="hero-linebreak" /> getting <em>attention</em><br className="hero-linebreak" /> across Bengaluru?</h1><p className="hero-deck">A live lens on the city&apos;s public internet.<br />We track what&apos;s accelerating, with evidence from multiple sources.</p></div>
      <dl className="hero-stats"><div><dt>Signals analyzed <span>LAST 24H</span></dt><dd>{pulse.totalSignals.toLocaleString("en-IN")}<small>{pulse.mode === "demo" ? "fictional demo signals" : "public signals collected"}</small></dd></div><div><dt>Sources active</dt><dd>{pulse.availableSources.length}<span className="stat-denominator"> / 3</span><small>GDELT · Bluesky · Hacker News{pulse.mode === "demo" ? " · simulated" : ""}</small></dd></div><div className="stat-updated"><dt>{pulse.mode === "demo" ? "Demo snapshot" : "Last updated"}</dt><dd>{pulse.generatedAt ? formatTime(pulse.generatedAt) + " IST" : "Pending"}<small>{pulse.mode === "demo" ? "Reproducible fixtures · no live collection" : elapsedLabel(pulse.generatedAt, now)}</small></dd></div></dl>
    </section>
    <div className="mode-notice"><span className="notice-label">{pulse.mode === "demo" ? "DEMO EDITION" : pulse.stale || pulse.status === "unavailable" ? "COLLECTION DELAYED" : pulse.status === "degraded" ? "PARTIAL COVERAGE" : "PUBLIC INTERNET"}</span><p>{pulse.mode === "demo" ? "Fictional evidence. Real scoring engine. Explore the product without API bills." : pulse.notice ?? "Public signals are sampled, deduplicated and scored. Follow the evidence before drawing conclusions."}</p><Link href="/about#live">Data & limitations ↗</Link></div>
    <section className="rising-section" aria-labelledby="rising-heading">
      <div className="editorial-section-heading"><div><h2 id="rising-heading">Rising now<span className="section-number mono">{String(shown.length).padStart(2, "0")}</span></h2><p>Ranked by momentum. Every score has a paper trail.</p></div><div className="window-controls" role="group" aria-label="Activity time window">{(["2h", "6h", "24h"] as const).map((window) => <button key={window} aria-pressed={filters.window === window} onClick={() => changeFilters({ ...filters, window })}>{window.toUpperCase()}</button>)}</div></div>
      <div className="discovery-controls"><div className="category-controls" role="group" aria-label="Topic categories"><button aria-pressed={!filters.category} onClick={() => changeFilters({ ...filters, category: undefined })}>All</button>{filterCategories.map((category) => <button key={category} aria-pressed={filters.category === category} onClick={() => changeFilters({ ...filters, category })}>{categoryLabels[category]}</button>)}</div><div className="discovery-tools"><label className="editorial-search"><Search size={14} aria-hidden="true" /><input aria-label="Search topics" type="search" placeholder="Find a topic" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} /></label><label className="source-select"><span className="sr-only">Filter by source</span><select aria-label="Filter by source" value={filters.source ?? ""} onChange={(e) => changeFilters({ ...filters, source: (e.target.value || undefined) as ReadQuery["source"] })}><option value="">All sources</option>{sources.map((s) => <option key={s} value={s}>{sourceNames[s]}</option>)}</select></label><button className="refresh-button" aria-label="Refresh pulse" title="Read the latest stored snapshot" disabled={refreshing} onClick={() => void refresh(filters)}><RefreshCw size={14} aria-hidden="true" /></button></div></div>
      <div className="read-feedback" role="status" aria-live="polite">{refreshing ? "Reading the selected snapshot…" : error ? error : shown.length + " topics · " + pulse.window.toUpperCase() + " activity · Pulse Scores always compare the latest 2H with the previous 2H."}{error && <button onClick={() => void refresh(filters)}>Retry read</button>}</div>
      {refreshing && mismatched ? <div className="trends-loading" role="status"><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-line" /><span className="sr-only">Loading filtered trends</span></div> : lead ? <div className="editorial-trends"><LeadTopic topic={lead} rank={pulse.topTopics.findIndex((t) => t.slug === lead.slug) + 1} window={pulse.window} /><ol className="secondary-topics">{rest.map((topic) => <SecondaryTopic key={topic.slug} topic={topic} rank={pulse.topTopics.findIndex((t) => t.slug === topic.slug) + 1} window={pulse.window} />)}{rest.length === 0 && <li className="single-topic-note">One topic meets the evidence threshold in this selection.<p>At least two distinct signals are required. A quiet window is useful information, too.</p></li>}</ol></div> : <div className="editorial-empty"><span className="editorial-eyebrow">A QUIET WINDOW</span><h3>{query || filters.category || filters.source ? "No matching conversations" : "Waiting for a pulse"}</h3><p>{query || filters.category || filters.source ? "No topics meet the evidence threshold for this selection. Try another category, a wider window or clear the filters." : "Topics appear after at least two distinct recent signals are collected and grouped. Source gaps and delays stay visible here."}</p>{query || filters.category || filters.source ? <button className="editorial-link" onClick={clearFilters}>Clear filters ↗</button> : <button className="editorial-link" disabled={refreshing} onClick={() => void refresh(filters)}>Check for an update ↗</button>}</div>}
      <p className="scoring-footnote"><span className="footnote-mark">↗</span> 40% velocity · 25% volume · 20% source diversity · 15% recency. Confidence is measured separately.<Link href="/about#scoring">Inspect the formula</Link></p>
    </section>
    <div className="city-intelligence"><MomentumChart topics={shown} initialDetail={initialDetail} mode={pulse.mode} capturedAt={pulse.generatedAt} /><Neighborhoods hotspots={pulse.hotspots} window={pulse.window} mode={pulse.mode} /></div>
    <SourceStream pulse={pulse} />
    <section className="how-it-works" aria-labelledby="how-heading"><div className="editorial-section-heading"><div><h2 id="how-heading">A little less noise. A little more signal.</h2><p>From public conversation to a pulse you can explain.</p></div><Link className="editorial-link" href="/about">How it works ↗</Link></div><ol className="pipeline-steps"><li><span className="mono">01 / INPUT</span><h3>PUBLIC SIGNALS</h3><p>Recent articles, public posts and tech discussions. Original timestamps and links preserved.</p></li><li><span className="mono">02 / UNDERSTAND</span><h3>AI NORMALIZATION</h3><p>Equivalent mentions become one topic. The free local mock works without a paid API.</p></li><li><span className="mono">03 / MEASURE</span><h3>EXPLAINABLE MOMENTUM</h3><p>Deduplicated evidence. Bounded equations. AI never decides the score or the ranking.</p></li></ol></section>
  </div>;
}
