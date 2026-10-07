"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDownRight, Radio, Search, RefreshCw, Info, Check, Minus } from "lucide-react";
import { categories, sourceNames, sources } from "@/lib/domain/schema";
import { dashboardSchema, type DashboardData as Pulse, type PublicTopic as Trend } from "@/lib/domain/read-models";
import { formatTime, formatDate } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Sparkline } from "./charts";
import { Hotspots } from "./hotspots";
import { formatChange } from "@/lib/trends/presentation";

function TrendRow({ trend, rank }: { trend: Trend; rank: number }) {
  const GrowthIcon = trend.growthPercent > 0 ? ArrowUpRight : trend.growthPercent < 0 ? ArrowDownRight : Minus;
  return <li className="trend-row"><span className="trend-rank mono">{String(rank).padStart(2, "0")}</span>
    <div className="trend-body"><div className="trend-meta"><span>{trend.category}</span><Badge variant={trend.lifecycle === "COOLING" || trend.lifecycle === "STABLE" ? "secondary" : "default"}>{trend.lifecycle}</Badge></div>
      <h3><Link href={`/topic/${trend.slug}`}>{trend.title}<ArrowUpRight size={17} aria-hidden="true" /></Link></h3>
      <p>{trend.current2h} signals in 2h <span aria-hidden="true">·</span> {trend.sourceCount} sources <span aria-hidden="true">·</span> {trend.confidenceLabel} confidence</p><p>{trend.sources.map((s) => sourceNames[s]).join(" + ")}</p></div>
    <div className="trend-chart"><Sparkline history={trend.history} cooling={trend.lifecycle === "COOLING"} /><span>24h activity</span></div>
    <div className="trend-score"><strong className="mono">{trend.score}<span className="sr-only"> out of 100 Pulse Score</span></strong><span className={trend.growthPercent > 0 ? "growth-positive" : "growth-other"} title="Smoothed change vs previous 2h; denominator floor 3 signals, positive change capped at 300%"><GrowthIcon size={13} aria-hidden="true" />{formatChange(trend)}<span className="sr-only"> smoothed change compared with the previous two hours; baseline floor three signals</span></span></div>
  </li>;
}
export function Dashboard({ initialPulse }: { initialPulse: Pulse }) {
  const [pulse, setPulse] = useState(initialPulse);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [risingOnly, setRisingOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    setRefreshing(true); setMessage("");
    try {
      const response = await fetch("/api/pulse", { signal: AbortSignal.timeout(10000) });
      const next = dashboardSchema.parse(await response.json());
      setPulse(next); setMessage(next.status === "unavailable" ? "Live data is unavailable." : "Snapshot refreshed.");
    } catch { setMessage("Could not refresh. Showing the last loaded snapshot."); }
    finally { setRefreshing(false); }
  }
  useEffect(() => {
    if (pulse.mode !== "live") return;
    const timer = setInterval(() => {
      void fetch("/api/pulse", { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).then((data: unknown) => { const parsed = dashboardSchema.safeParse(data); if (parsed.success) setPulse(parsed.data); }).catch(() => setMessage("Automatic refresh failed. Showing the last loaded snapshot."));
    }, 60000);
    return () => clearInterval(timer);
  }, [pulse.mode]);
  const trends = pulse.topTopics.filter((t) => (!query || `${t.title} ${t.description}`.toLowerCase().includes(query.toLowerCase())) && (!category || t.category === category) && (!source || t.sources.some((s) => s === source)) && (!risingOnly || ["RISING", "EMERGING", "HOT"].includes(t.lifecycle)));
  const availableSources = pulse.availableSources.length;
  return <>
    <section className="hero"><div className="eyebrow"><span className="signal-dot" /> Bengaluru internet observatory <span className="hero-date">{formatDate(pulse.generatedAt ?? pulse.evaluatedAt)}</span></div>
      <h1>Bengaluru, <span>in motion.</span></h1><p className="tagline">The city&apos;s internet, compressed into one pulse.</p>
      <p className="hero-description">Discover what&apos;s suddenly getting attention across Bengaluru.<br className="desktop-break" /> Rising topics, measured from public signals across multiple sources.</p>
      <div className="hero-bottom"><div className="source-labels"><Radio size={15} aria-hidden="true" /><span>GDELT</span><span>Bluesky</span><span>Hacker News</span></div><Link className="text-link" href="/about">Momentum, explained <ArrowRight size={15} aria-hidden="true" /></Link></div>
    </section>
    <div className={`data-notice ${pulse.mode === "demo" ? "demo-notice" : ""}`} role="status"><Info size={16} aria-hidden="true" /><p>{pulse.mode === "demo" ? <><strong>Demo snapshot.</strong> Fictional example signals show how topic momentum is measured across three public sources.</> : pulse.notice ?? "Live public signals. Rankings reflect observed momentum, not overall popularity."}</p>{pulse.mode === "demo" && <Link href="/about#live">About live mode <ArrowUpRight size={12} aria-hidden="true" /></Link>}</div>
    <section className="metrics" aria-label="Snapshot summary"><div><span>Active topics</span><strong className="mono">{String(pulse.topTopics.length).padStart(2, "0")}</strong><p>with at least 2 recent items</p></div><div><span>Observed signals</span><strong className="mono">{pulse.totalSignals.toLocaleString("en-IN")}</strong><p>distinct items · 24h at collection</p></div><div><span>Source coverage</span><strong className="mono">{availableSources}<small> / 3</small></strong><p>{pulse.mode === "demo" ? "simulated source coverage" : "sources available at last poll"}</p></div><div className="updated-metric"><span>{pulse.mode === "demo" ? "Example generated" : pulse.generatedAt ? "Last collected" : "Collection status"}</span><strong className="mono metric-time">{pulse.generatedAt ? <>{formatTime(pulse.generatedAt)}<small> IST</small></> : "Pending"}</strong><p>{!pulse.generatedAt ? "no snapshot available" : pulse.stale ? "Stale · fresh collection needed" : pulse.mode === "demo" ? "fictional demonstration" : "dashboard checks every minute"}</p></div></section>
    <div className="dashboard-grid"><section className="trends-section" aria-labelledby="trends-heading"><div className="section-heading"><h2 id="trends-heading">Picking up now<span className="heading-count">{trends.length}</span></h2><Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={13} aria-hidden="true" />{refreshing ? "Refreshing" : "Refresh"}</Button></div>
      <p className="section-description">Ranked by Pulse Score. Smoothed change compares consecutive 2-hour windows with a 3-signal baseline floor.</p>
      <div className="filters"><div className="search-field"><Search size={15} aria-hidden="true" /><input aria-label="Search topics" placeholder="Search the city’s conversation" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
      </div><div className="secondary-filters"><Button size="sm" variant={risingOnly ? "secondary" : "ghost"} aria-pressed={risingOnly} onClick={() => setRisingOnly(!risingOnly)}>{risingOnly && <Check size={12} aria-hidden="true" />}Rising & emerging</Button><select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s} value={s}>{sourceNames[s]}</option>)}</select><span className="score-label">Pulse / 100</span></div>
      <p className="sr-only" role="status">{message || `${trends.length} topics shown`}</p>
      {message && <p className="refresh-message">{message}</p>}
      <ol className="trend-list">{trends.map((trend) => <TrendRow key={trend.slug} trend={trend} rank={pulse.topTopics.findIndex((t) => t.slug === trend.slug) + 1} />)}</ol>
      {!trends.length && <div className="empty-state"><Search size={23} aria-hidden="true" /><h3>{pulse.topTopics.length ? "No matching conversations" : "Waiting for a pulse"}</h3><p>{pulse.topTopics.length ? "Try a different search or clear the filters." : pulse.notice ?? "Topics appear when at least two distinct recent items are observed."}</p>{pulse.topTopics.length > 0 && <Button variant="outline" size="sm" onClick={() => { setQuery(""); setCategory(""); setSource(""); setRisingOnly(false); }}>Clear filters</Button>}</div>}
      <p className="ranking-note"><Info size={13} aria-hidden="true" />Velocity, volume, diversity and recency. Confidence is measured separately. <Link href="/about#scoring">See the formula</Link></p>
    </section><aside><Hotspots hotspots={pulse.hotspots} trends={pulse.topTopics} /><section className="source-health" aria-labelledby="sources-heading"><div className="section-heading"><h2 id="sources-heading">Signal health</h2><Radio size={15} aria-hidden="true" /></div>{pulse.sources.map((s) => <div className="source-health-row" key={s.source}><span>{sourceNames[s.source]}</span><span className={`health-status health-${s.stale ? "unavailable" : s.status}`}><span className="signal-dot" />{s.stale ? "Stale" : s.status === "demo" ? "Demo" : s.status === "ok" ? "Available" : s.status === "partial" ? "Partial" : "Unavailable"}</span></div>)}<p>Public search is sampled. Coverage is a window into the conversation, not a census.</p></section></aside></div>
  </>;
}
