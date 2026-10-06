import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Info, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { readPulse } from "@/lib/server/read";
import { sourceNames, slugSchema } from "@/lib/domain/schema";
import { formatTime, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { HistoryChart } from "@/components/charts";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const topic = (await readPulse()).trends.find((t) => t.slug === slug); return { title: topic?.title ?? "Topic unavailable" }; }
export default async function TopicPage({ params }: Props) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const pulse = await readPulse();
  if (pulse.status === "unavailable") return <section className="empty-state page-empty"><h1>Live data is unavailable</h1><p>{pulse.notice}</p><Link href="/" className="text-link">Return to the pulse <ArrowLeft size={14} /></Link></section>;
  const trend = pulse.trends.find((t) => t.slug === slug);
  if (!trend) notFound();
  const factors = [{ name: "Velocity", value: trend.velocity, weight: "40%" }, { name: "Volume", value: trend.volume, weight: "20%" }, { name: "Source diversity", value: trend.diversity, weight: "15%" }, { name: "Recency", value: trend.recency, weight: "10%" }, { name: "Confidence", value: trend.confidence, weight: "15%" }];
  return <article className="topic-page"><Link href="/" className="back-link"><ArrowLeft size={14} aria-hidden="true" /> Back to the pulse</Link>
    {(pulse.mode === "demo" || pulse.stale || pulse.notice) && <div className="data-notice" role="status"><Info size={16} aria-hidden="true" /><p>{pulse.mode === "demo" ? "Demo topic · fictional evidence, real deterministic scoring." : pulse.notice}</p></div>}
    <div className="topic-heading"><div><div className="eyebrow">{trend.category} <Badge>{trend.lifecycle}</Badge></div><h1>{trend.title}</h1><p>{trend.description}</p></div><div className="detail-score"><strong className="mono">{trend.score}</strong><span>Pulse Score / 100</span></div></div>
    <p className="topic-explanation">{trend.explanation}</p><section className="detail-metrics" aria-label="Topic metrics"><div><span>3-hour growth</span><strong className="mono">{trend.growthPercent > 0 ? "+" : ""}{trend.growthPercent}%</strong></div><div><span>Current / baseline</span><strong className="mono">{trend.currentCount} / {trend.baselineCount}</strong></div><div><span>Public sources</span><strong className="mono">{trend.sources.length} / 3</strong></div><div><span>Confidence</span><strong className="capitalize">{trend.confidenceLabel}</strong></div></section>
    <div className="detail-grid"><section><div className="section-heading"><h2>Attention over time</h2><span className="muted">24 hours</span></div><HistoryChart history={trend.history} />
      <section className="evidence-section"><div className="section-heading"><h2>{pulse.mode === "demo" ? "Example evidence" : "Public evidence"}</h2><span className="muted">{trend.totalCount} distinct items</span></div><p className="section-description">Original source links and timestamps. GDELT times indicate discovery.</p><ol className="evidence-list">{trend.evidence.slice(0, 30).map((o) => <li key={o.id}><div className="evidence-meta"><Badge variant="outline">{sourceNames[o.source]}</Badge><span>{formatDate(o.publishedAt)} · {formatTime(o.publishedAt)} IST{o.timeKind === "discovered" ? " · discovered" : ""}</span></div>{pulse.mode === "demo" ? <p>{o.title}</p> : <a href={o.url} target="_blank" rel="noopener noreferrer">{o.title}<ArrowUpRight size={14} aria-hidden="true" /></a>}{o.neighborhood && <span className="evidence-location"><MapPin size={12} aria-hidden="true" />{o.neighborhood} mentioned</span>}</li>)}</ol>{trend.totalCount > 30 && <p className="muted">Showing the 30 most recent items. Complete evidence is available through the topic API.</p>}</section></section>
      <aside className="score-breakdown"><h2>Behind the score</h2><p>Five measurable inputs. The same evidence always produces the same ranking.</p>{factors.map((f) => <div className="factor" key={f.name}><div><span>{f.name}</span><span className="mono">{Math.round(f.value * 100)}<small> / 100</small></span></div><div className="factor-track"><span style={{ width: `${f.value * 100}%` }} /></div><span className="factor-weight">{f.weight} of final score</span></div>)}<p className="score-caveat">Confidence measures sampled corroboration, not factual verification. AI can match topics; it never sets this score.</p><Link className="text-link" href="/about#scoring">Full methodology <ArrowUpRight size={13} aria-hidden="true" /></Link><p className="collection-time">{pulse.generatedAt ? `Collected ${formatTime(pulse.generatedAt)} IST` : "No collection available"}<br />Evaluated {formatTime(pulse.evaluatedAt)} IST</p></aside></div>
  </article>;
}
