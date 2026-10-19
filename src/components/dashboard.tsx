"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { sourceNames, sources } from "@/lib/domain/source-labels";
import type { DashboardData, PublicTopic, ReadQuery, DashboardQuery } from "@/lib/domain/read-models";
import type { ChartHistoryData } from "@/lib/trends/chart-history";
import { abortableRead } from "@/lib/client/abortable-read";
import { categoryLabels, filterCategories, elapsedLabel, emptyDashboardState, pulseMetadata } from "@/lib/trends/dashboard-presentation";
import { statusLabel } from "@/lib/trends/status-label";
import { formatChange } from "@/lib/trends/presentation";
import { formatDate, formatTime } from "@/lib/format";
import { MomentumChart } from "./momentum-chart";
import { Neighborhoods } from "./neighborhoods";
import { SourceStream } from "./source-stream";
import { leadEligible } from "@/lib/trends/lead-eligibility";
import { ReadingHelp } from "./reading-help";
import { RecentConversations } from "./recent-conversations";
import { ScoreDiagnostics } from "./score-diagnostics";
import { usePublishPulse, usePulseStatus } from "./pulse-context";

function SnapshotAge({ generatedAt }: { generatedAt: string | null }) {
  const { now } = usePulseStatus();
  return <small>{elapsedLabel(generatedAt, now)}</small>;
}

function TopicMeta({ topic }: { topic: PublicTopic }) {
  return <div className="topic-kicker"><span>{categoryLabels[topic.semanticCategory]}</span><span aria-hidden="true">/</span><span>{topic.neighborhood ?? "Citywide / Unknown"}</span><span className={"lifecycle lifecycle-" + topic.lifecycle.toLowerCase()}>{topic.lifecycle}</span></div>;
}
function Change({ topic }: { topic: PublicTopic }) {
  return <span className={topic.growthPercent > 0 ? "growth-positive" : "growth-other"} title="Change vs previous 2h. Baseline floor: 3 signals; positive change capped at 300%.">{formatChange(topic)}</span>;
}
function LeadTopic({ topic, rank, window }: { topic: PublicTopic; rank: number; window: ReadQuery["window"] }) {
  return <article className="lead-topic trend-entry">
    <div className="lead-overline"><span className="mono">{String(rank).padStart(2, "0")}</span><span>{topic.current2h >= 2 ? "LEADING MOMENTUM" : "RECENTLY OBSERVED"}</span></div>
    <TopicMeta topic={topic} />
    <h3><Link href={"/topic/" + topic.slug}>{topic.title}</Link></h3>
    <p className="lead-description">{topic.description}</p>
    <div className="lead-scoreline"><div className="lead-score"><strong key={topic.score}>{topic.score}</strong><span>PULSE SCORE <span className="muted">/ 100</span></span></div><div className="lead-change"><Change topic={topic} /><span>vs previous 2h</span></div><ActivityTrace topic={topic} /></div>
    <dl className="lead-evidence"><div><dt>Signals · {window.toUpperCase()}</dt><dd>{topic.activityCount}</dd></div><div><dt>Sources · 2H</dt><dd>{topic.sourceCount}</dd></div><div><dt>Confidence</dt><dd>{Math.round(topic.confidence * 100)}<small>%</small></dd></div></dl>
    <p className="lead-providers">{topic.sources.map((s) => sourceNames[s]).join(" · ")}</p>
    <Link href={"/topic/" + topic.slug} className="editorial-link">Follow the evidence <ArrowUpRight size={14} aria-hidden="true" /></Link>
  </article>;
}
function ActivityTrace({ topic }: { topic: PublicTopic }) {
  const peak = Math.max(1, ...topic.history.map((row) => row.count));
  const points = topic.history.map((row, index) => `${index / Math.max(1, topic.history.length - 1) * 170},${44 - row.count / peak * 36}`).join(" ");
  return <div className="activity-trace"><svg viewBox="0 0 170 50" role="img" aria-label={`${topic.title}: distinct signals per hour over the last 24 hours`}><path d="M0 45H170" className="trace-baseline" /><polyline points={points} fill="none" className="trace-line" /></svg><span>24H SIGNAL ACTIVITY</span></div>;
}
function CityBriefing({ pulse }: { pulse: DashboardData }) {
  const { now } = usePulseStatus();
  const leading = pulse.hotspots[0];
  const categoryCounts = new Map<PublicTopic["semanticCategory"], number>();
  for (const topic of pulse.topTopics) categoryCounts.set(topic.semanticCategory, (categoryCounts.get(topic.semanticCategory) ?? 0) + topic.activityCount);
  const category = [...categoryCounts].sort((a, b) => b[1] - a[1])[0];
  return <aside className="city-briefing" aria-label="City briefing"><div className="briefing-heading"><span className="panel-overline">CITY BRIEFING</span><span className="edition-coordinate mono">12.97° N / 77.59° E</span></div>
    <div className="briefing-volume"><strong>{pulse.generatedAt ? pulse.totalSignals.toLocaleString("en-IN") : "—"}</strong><span>distinct signals / 24h</span><p>{pulse.mode === "demo" ? "Fictional evidence. Real scoring engine." : "Public news, social posts & tech discussions."}</p></div>
    <div className="briefing-collection"><div className="briefing-subhead"><h3>Collection</h3><span>{pulse.availableSources.length} / {pulse.sources.length} {pulse.mode === "demo" ? "simulated" : "available"}</span></div><ul>{pulse.sources.map((source) => <li key={source.source}><span className={`source-mark state-${source.healthState}`} aria-hidden="true" /><span>{sourceNames[source.source]}</span><span className={`source-health-label state-${source.healthState}`}>{pulse.mode === "demo" ? "Demo" : source.healthState}</span><small>{pulse.mode === "demo" ? "Fixture" : elapsedLabel(source.lastSuccessAt, now)}</small></li>)}</ul></div>
    <dl className="briefing-context"><div><dt>Most active category · {pulse.window.toUpperCase()}</dt><dd>{category ? categoryLabels[category[0]] : "No qualifying topics"}</dd></div><div><dt>Most mentioned neighborhood · {pulse.window.toUpperCase()}</dt><dd>{leading ? leading.neighborhood : "No supported location"}</dd></div></dl>
    <Link className="editorial-link" href="/about">How to read the pulse <ArrowUpRight size={14} aria-hidden="true" /></Link>
  </aside>;
}
function SecondaryTopic({ topic, rank, window }: { topic: PublicTopic; rank: number; window: ReadQuery["window"] }) {
  return <li className="secondary-topic trend-entry"><span className="secondary-rank mono">{String(rank).padStart(2, "0")}</span><div className="secondary-copy"><TopicMeta topic={topic} /><h3><Link href={"/topic/" + topic.slug}>{topic.title}</Link></h3><p>{topic.activityCount} signals · {window.toUpperCase()} <span aria-hidden="true"> / </span>{topic.sourceCount} sources · 2H</p></div><div className="secondary-score"><strong>{topic.score}<span className="sr-only"> Pulse Score out of 100</span></strong><Change topic={topic} /></div></li>;
}
export function Dashboard({ initialPulse, initialDetail }: { initialPulse: DashboardData; initialDetail: ChartHistoryData | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [pulse, setPulse] = useState(initialPulse), [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DashboardQuery>({ window: initialPulse.requestedWindow });
  const [refreshing, setRefreshing] = useState(false), [error, setError] = useState("");
  const publish = usePublishPulse();
  const controller = useRef<AbortController | null>(null), requestId = useRef(0);
  const applied = useRef<DashboardQuery>({ window: initialPulse.requestedWindow, category: initialPulse.filters.category ?? undefined, source: initialPulse.filters.source ?? undefined });
  const refresh = useCallback(async (next: DashboardQuery) => {
    const id = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const deadline = setTimeout(() => abort.abort(), 10_000);
    setRefreshing(true); setError("");
    try {
      const params = new URLSearchParams({ window: next.window });
      if (next.category) params.set("category", next.category);
      if (next.source) params.set("source", next.source);
      const [response, { dashboardSchema }] = await abortableRead(Promise.all([
        fetch("/api/pulse?" + params, { signal: abort.signal, cache: "no-store" }), import("@/lib/domain/read-models"),
      ]), abort.signal);
      // An unavailable read still returns a validated, honest empty model.
      if (!response.ok && response.status !== 503) throw new Error("READ_FAILED");
      const data = dashboardSchema.parse(await response.json());
      if (data.requestedWindow !== next.window || data.filters.category !== (next.category ?? null) || data.filters.source !== (next.source ?? null)) throw new Error("QUERY_MISMATCH");
      if (id === requestId.current) { applied.current = next; setPulse(data); publish(data); }
    } catch {
      if (id === requestId.current) { setFilters(applied.current); setError("The data could not be refreshed. Your last snapshot and filters are still shown."); }
    } finally { clearTimeout(deadline); if (id === requestId.current) setRefreshing(false); }
  }, [publish]);
  useEffect(() => {
    if (pulse.mode !== "live") return;
    const timer = setInterval(() => { void refresh(filters); }, 60_000);
    return () => clearInterval(timer);
  }, [pulse.mode, filters, refresh]);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!root.current || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("section-arrived"); observer.unobserve(entry.target); }
    }, { threshold: 0.08 });
    root.current.querySelectorAll(".momentum-panel, .neighborhood-panel, .source-stream").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  const changeFilters = (next: DashboardQuery) => { setFilters(next); void refresh(next); };
  const clearFilters = () => { setQuery(""); changeFilters({ window: filters.window }); };
  const shown = useMemo(() => pulse.topTopics.filter(leadEligible).filter((t) => (t.title + " " + t.description + " " + (t.neighborhood ?? "")).toLowerCase().includes(query.trim().toLowerCase())), [pulse.topTopics, query]);
  const lead = shown[0], rest = shown.slice(1);
  const hasCurrentMomentum = shown.length > 0;
  const collectionLabel = statusLabel(pulseMetadata(pulse), Date.parse(pulse.evaluatedAt));
  const hasFilters = Boolean(query || filters.category || filters.source);
  const empty = emptyDashboardState(pulse, hasFilters);
  const mismatched = filters.window !== pulse.requestedWindow || (filters.category ?? null) !== pulse.filters.category || (filters.source ?? null) !== pulse.filters.source;
  return <div ref={root} className="pulse-home">
    <section className="pulse-hero" aria-labelledby="hero-heading">
      <div className="hero-main"><div className="editorial-eyebrow"><span>BENGALURU / PUBLIC INTERNET OBSERVATORY</span><span className="hero-edition">{formatDate(pulse.evaluatedAt)} · IST</span></div><h1 id="hero-heading">What&apos;s moving <span>Bengaluru?</span></h1><p className="hero-deck">The city&apos;s public internet, measured in motion.</p><p className="sampling-note">Public signals are samples, not a census of Bengaluru.</p></div>
      <dl className="hero-stats"><div className="stat-updated"><dt>{pulse.mode === "demo" ? "Demo snapshot" : "Latest snapshot"}</dt><dd>{pulse.generatedAt ? <time dateTime={pulse.generatedAt}>{formatTime(pulse.generatedAt)} IST</time> : "Pending"}{pulse.mode === "live" && <SnapshotAge generatedAt={pulse.generatedAt} />}</dd></div><div className="hero-coverage"><dt className="sr-only">Coverage</dt><dd>{pulse.generatedAt ? pulse.totalSignals.toLocaleString("en-IN") : "—"} {pulse.mode === "demo" ? "demo" : "distinct"} signals / 24h<br />{pulse.availableSources.length} of {pulse.sources.length} sources {pulse.mode === "demo" ? "simulated" : "available"}</dd></div></dl>
    </section>
    {(pulse.mode === "demo" || collectionLabel !== "Live") && <div className="mode-notice"><span className="notice-label"><span className="signal-dot" aria-hidden="true" />{pulse.mode === "demo" ? "DEMO EDITION" : collectionLabel.toUpperCase()}</span><p>{pulse.mode === "demo" ? "Fictional evidence. Real scoring engine." : `${pulse.availableSources.length} / ${pulse.sources.length} sources available. Retained evidence stays visible.`}</p><Link href="/status" className="editorial-link">Collection details ↗</Link></div>}
    <div className="front-page-grid"><section id="explore" className="rising-section" aria-labelledby="rising-heading">
      <div className="editorial-section-heading"><div><div className="section-index mono">01 / THE CONVERSATION</div><h2 id="rising-heading">{hasCurrentMomentum ? "Rising now" : "Recent observations"}<span className="section-number mono">{String(shown.length).padStart(2, "0")}</span></h2></div><div className="window-controls" role="group" aria-label="Activity time window">{(["now", "2h", "6h", "24h"] as const).map((window) => <button key={window} aria-pressed={filters.window === window} onClick={() => changeFilters({ ...filters, window })}>{window.toUpperCase()}</button>)}</div></div>
      <div className="discovery-controls"><label className="editorial-search"><Search size={16} aria-hidden="true" /><input aria-label="Search topics" type="search" placeholder="Find a topic or neighborhood" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} /></label><div className="discovery-tools"><label className="category-select"><span className="sr-only">Topic category</span><select aria-label="Topic category" value={filters.category ?? ""} onChange={(e) => changeFilters({ ...filters, category: filterCategories.find((category) => category === e.target.value) })}><option value="">All categories</option>{filterCategories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label><label className="source-select"><span className="sr-only">Filter by source</span><select aria-label="Filter by source" value={filters.source ?? ""} onChange={(e) => changeFilters({ ...filters, source: sources.find((source) => source === e.target.value) })}><option value="">All sources</option>{sources.filter((s) => pulse.sources.some((row) => row.source === s) || pulse.sourceStream.some((row) => row.source === s)).map((s) => <option key={s} value={s}>{sourceNames[s]}</option>)}</select></label><button className="refresh-button" aria-label="Refresh pulse" title="Read the latest stored snapshot" disabled={refreshing} onClick={() => void refresh(filters)}><RefreshCw size={16} aria-hidden="true" /></button></div></div>
      <p className="window-explanation" role="status">{pulse.requestedWindow === "now" ? pulse.window === "2h" ? "NOW · Activity from the last 2 hours." : `2H is quiet · showing ${pulse.window.toUpperCase()} activity. Scores still measure the latest 2H.` : `${pulse.window.toUpperCase()} activity · scores measure the latest 2H.`}</p>
      {!hasFilters && shown.length > 0 && shown.length < 4 && <p className="ranking-coverage-note">{shown.length} {shown.length === 1 ? "topic meets" : "topics meet"} the evidence threshold in this window. Browse early mentions and quieter topics in Recently observed below.</p>}
      <div className={"read-feedback" + (!refreshing && !error ? " sr-only" : "")} role="status" aria-live="polite">{refreshing ? "Reading the selected snapshot…" : error ? error : shown.length + " topics · " + pulse.window.toUpperCase() + " activity."}{error && <button onClick={() => void refresh(filters)}>Retry read</button>}</div>
      {refreshing && mismatched ? <div className="trends-loading" role="status"><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-line" /><span className="sr-only">Loading filtered trends</span></div> : lead ? <div className="editorial-trends"><LeadTopic topic={lead} rank={pulse.topTopics.findIndex((t) => t.slug === lead.slug) + 1} window={pulse.window} /><ol className="secondary-topics">{rest.map((topic) => <SecondaryTopic key={topic.slug} topic={topic} rank={pulse.topTopics.findIndex((t) => t.slug === topic.slug) + 1} window={pulse.window} />)}{rest.length === 0 && <li className="single-topic-note">One topic meets the evidence threshold in this selection.<p>At least two distinct signals are required. A quiet window is useful information, too.</p></li>}</ol></div> : <div className="editorial-empty"><span className="editorial-eyebrow">{empty.eyebrow}</span><h3>{empty.title}</h3><p>{empty.description}</p><div className="empty-actions">{hasFilters ? <button className="editorial-link" onClick={clearFilters}>Clear filters ↗</button> : <button className="editorial-link" disabled={refreshing} onClick={() => void refresh(filters)}>Check for an update ↗</button>}{pulse.mode === "live" && <Link className="editorial-link" href="/about#demo">Watch a labeled demo ↗</Link>}</div></div>}
      <ReadingHelp /><p className="scoring-footnote">Scores compare successive 2h windows. Confidence is measured separately.<Link href="/about#scoring">How scoring works ↗</Link></p>
    </section><CityBriefing pulse={pulse} /></div>
    <RecentConversations conversations={pulse.recentConversations} query={query} demo={pulse.mode === "demo"} fallback={!hasCurrentMomentum} />
    <ScoreDiagnostics topics={pulse.diagnosticTopics} query={query} />
    {(pulse.mode === "demo" || pulse.totalSignals > 0) && <div className="city-intelligence"><MomentumChart topics={shown} initialDetail={initialDetail} mode={pulse.mode} capturedAt={pulse.generatedAt} /><Neighborhoods hotspots={pulse.hotspots} window={pulse.window} mode={pulse.mode} /></div>}
    <SourceStream pulse={pulse} />
  </div>;
}
