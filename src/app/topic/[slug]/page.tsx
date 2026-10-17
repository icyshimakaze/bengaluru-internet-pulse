import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { readTopic, ReadUnavailableError } from "@/lib/server/queries";
import { slugSchema, sourceNames } from "@/lib/domain/schema";
import { formatDate, formatTime } from "@/lib/utils";
import { formatChange } from "@/lib/trends/presentation";
import { categoryLabels } from "@/lib/trends/dashboard-presentation";
import { evidenceExplanation, evidenceLinks, observedMilestones } from "@/lib/trends/topic-presentation";
import { SnapshotHistory } from "@/components/snapshot-history";
import { TopicEvidence, RelatedSignals } from "@/components/topic-evidence";
import { TopicRecovery } from "@/components/topic-recovery";
import { pageMetadata, siteOrigin } from "@/lib/server/metadata";
import { ShareTopic } from "@/components/share-topic";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) return { title: "Topic unavailable", robots: { index: false } };
  try {
    const detail = await readTopic(slug);
    if (!detail) return { title: "Topic unavailable", robots: { index: false } };
    const description = (detail.mode === "demo" ? "Fictional demo evidence. " : "") + detail.summary;
    const metadata = pageMetadata(detail.topic.title + " | Bengaluru Pulse", description, "/topic/" + slug);
    const image = new URL(`/api/og/${slug}`, siteOrigin());
    return { ...metadata, title: detail.topic.title,
      openGraph: { ...metadata.openGraph, images: [{ url: image, width: 1200, height: 630, alt: `${detail.topic.title} · observed momentum, with timestamp and evidence counts` }] },
      twitter: { ...metadata.twitter, card: "summary_large_image", images: [image] } };
  }
  catch { return { title: "Topic unavailable", robots: { index: false } }; }
}
function Timestamp({ value, date = true }: { value: string | null; date?: boolean }) {
  return value ? <time dateTime={value}>{date && <>{formatDate(value)}<br /></>}{formatTime(value)} IST</time> : <>Unknown</>;
}
export default async function TopicPage({ params }: Props) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  let detail;
  try { detail = await readTopic(slug); }
  catch (error) { if (!(error instanceof ReadUnavailableError)) throw error; return <TopicRecovery />; }
  if (!detail) notFound();
  const topic = detail.topic, location = detail.locationEvidence, milestones = observedMilestones(detail.history);
  const factors = [
    { name: "Velocity", value: topic.velocity, weight: 40, description: "Bounded growth between successive two-hour windows, moderated by evidence volume." },
    { name: "Volume", value: topic.volume, weight: 25, description: "Distinct recent signals, logarithmically bounded so large counts cannot dominate." },
    { name: "Source diversity", value: topic.diversity, weight: 20, description: "Contributing news, social and tech channels in the latest two hours. GDELT and Currents share the news channel." },
    { name: "Recency", value: topic.recency, weight: 15, description: "Exponential decay since the latest signal. Older evidence contributes less." },
  ];
  const whyHeading = topic.lifecycle === "COOLING" ? "Why is this cooling?" : topic.lifecycle === "STABLE" ? "Why is this steady?" : topic.lifecycle === "NEW" ? "What is newly observed?" : "Why is this rising?";
  return <article className="topic-intelligence">
    <div className="topic-topline"><Link href="/" className="editorial-link"><ArrowLeft size={13} aria-hidden="true" /> Back to the pulse</Link><span className="mono">BENGALURU / SIGNAL BRIEF</span><ShareTopic title={topic.title} url={new URL(`/topic/${topic.slug}`, siteOrigin()).href} /></div>
    {(detail.mode === "demo" || detail.stale || detail.status === "degraded" || detail.notice) && <div className="topic-data-notice"><span className="notice-label">{detail.mode === "demo" ? "DEMO EDITION" : detail.stale ? "STALE COLLECTION" : detail.status === "unavailable" ? "COLLECTION UNAVAILABLE" : "PARTIAL COVERAGE"}</span><p>{detail.mode === "demo" ? "Demo topic · fictional evidence, real deterministic scoring." : "Scores reflect retained evidence, aged to the current time."}</p>{detail.mode !== "demo" && <details className="notice-details"><summary>View details</summary><p>{detail.notice ?? "Source coverage is degraded."}</p></details>}<Link href="/about#live">Data & limitations ↗</Link></div>}
    <header className="topic-editorial-header"><div className="topic-title-block"><div className="topic-category-line"><span>{categoryLabels[topic.semanticCategory]}</span><span aria-hidden="true">·</span><span>{location.neighborhood ?? "Citywide / Unknown"}</span></div><h1>{topic.title}</h1><p className="topic-deck">{topic.description}</p></div><div className="topic-pulse-block"><span className="panel-overline">PULSE SCORE / 100</span><strong className="topic-pulse-value">{topic.score}</strong><div className="topic-score-context"><span className={topic.growthPercent > 0 ? "growth-positive" : "growth-other"} title="Smoothed change vs previous 2h, with a three-signal baseline floor and 300% upper bound">{formatChange(topic)}</span><span>vs previous 2h</span></div><span className={"lifecycle lifecycle-" + topic.lifecycle.toLowerCase()}>{topic.lifecycle}</span></div></header>
    <dl className="topic-vitals" aria-label="Topic metrics"><div><dt>Signals · latest 2H</dt><dd>{topic.current2h}<small> / {topic.previous2h} previous</small></dd></div><div><dt>Source providers · 2H</dt><dd>{topic.sourceCount}</dd></div><div><dt>Confidence</dt><dd>{Math.round(topic.confidence * 100)}<small>% · {topic.confidenceLabel}</small></dd></div><div className="vital-first-seen"><dt title="Preserved first-seen timestamp; this may originate from source publication or discovery.">First detected</dt><dd><Timestamp value={topic.firstSeenAt} /></dd></div></dl>
    <div className="topic-analysis-grid">
      <section className="topic-why" aria-labelledby="why-heading"><h2 id="why-heading">{whyHeading}</h2><p className="why-explanation">{evidenceExplanation(topic)}</p><p className="why-source-basis">{topic.sources.length ? topic.sources.map((s) => sourceNames[s]).join(" · ") : "No contributing providers in the current window."} · Latest 2h. Source diversity indicates corroboration, not verified truth.</p></section>
      <section className="topic-where" aria-labelledby="where-heading"><h2 id="where-heading">Where</h2><h3>{location.neighborhood ?? "Citywide / Unknown"}</h3>{location.status === "supported" ? <><p className="where-evidence"><strong>{location.mentionCount}</strong> explicit mentions across <strong>{location.sourceCount}</strong> providers in the last 24 hours.</p><p>A place mentioned, not a verified incident location.</p></> : <p>{location.status === "mixed" ? "Mentions span multiple neighborhoods. No single neighborhood has sufficiently consistent support." : location.status === "insufficient" ? "Location evidence is too sparse or comes from one provider. No confident neighborhood assignment is shown." : "No explicit neighborhood is supported by the recent evidence. Locations are never guessed."}</p>}<Link className="editorial-link" href="/about#locations">Location methodology <ArrowUpRight size={13} aria-hidden="true" /></Link></section>
    </div>
    <SnapshotHistory history={detail.history} evaluatedAt={detail.snapshot.evaluatedAt} mode={detail.mode} truncated={detail.historyTruncated} />
    <section className="topic-lifecycle" aria-labelledby="lifecycle-heading"><div className="editorial-section-heading"><div><h2 id="lifecycle-heading">Trend lifecycle</h2><p>Observed milestones in retained v3 snapshots.</p></div><span className={"lifecycle lifecycle-" + topic.lifecycle.toLowerCase()}>CURRENT · {topic.lifecycle}</span></div><ol className="lifecycle-timeline"><li className={topic.firstSeenAt ? "milestone-observed" : ""}><span className="milestone-dot" aria-hidden="true" /><span className="milestone-label">First detected</span><strong><Timestamp value={topic.firstSeenAt} /></strong><p>Preserved first-seen metadata</p></li><li className={milestones.emerging ? "milestone-observed" : ""}><span className="milestone-dot" aria-hidden="true" /><span className="milestone-label">Emerging</span><strong>{milestones.emerging ? <Timestamp value={milestones.emerging.capturedAt} /> : "Not observed"}</strong><p>{milestones.emerging ? "First recorded EMERGING state" : "No retained EMERGING snapshot"}</p></li><li className={milestones.rising ? "milestone-observed" : ""}><span className="milestone-dot" aria-hidden="true" /><span className="milestone-label">Rising</span><strong>{milestones.rising ? <Timestamp value={milestones.rising.capturedAt} /> : "Not observed"}</strong><p>{milestones.rising ? "First recorded RISING state" : "No retained RISING snapshot"}</p></li><li className={milestones.peak ? "milestone-observed" : ""}><span className="milestone-dot" aria-hidden="true" /><span className="milestone-label">Peak / current state</span><strong>{milestones.peak ? <>Peak {milestones.peak.pulseScore}<small> / 100</small></> : "No peak recorded"}</strong><p>{milestones.peak && <Timestamp value={milestones.peak.capturedAt} />}<span className="milestone-current">Current {topic.score} / 100 · {topic.lifecycle}</span></p></li></ol><p className="lifecycle-caveat">Stages can recur or regress. Missing milestones are not inferred.{detail.historyTruncated ? " Retained history is limited to the most recent 96 records." : ""} First detection may use a source publication or discovery time.{detail.mode === "demo" ? " Timeline stages are from the labeled fixture replay." : ""}</p></section>
    <TopicEvidence evidence={evidenceLinks(detail.sourceEvidence)} mode={detail.mode} total={topic.count24h} truncated={detail.evidenceTruncated} />
    <section className="topic-methodology" aria-label="Score methodology"><details><summary><span>How is the score calculated?</span><span className="method-summary-meta">4 weighted inputs + separate confidence</span></summary><div className="methodology-content"><h2>Behind the score</h2><p>Only the deterministic engine scores and ranks topics. AI can group equivalent signals; it cannot assign scores, confidence or lifecycle.</p><div className="score-equation mono">100 × (0.40 × velocity + 0.25 × volume + 0.20 × diversity + 0.15 × recency)</div><p>Each component is normalized from 0 to 1. The engine rounds the result and applies evidence safeguards. These metrics use the latest two hours across all contributing providers.</p><div className="methodology-factors">{factors.map((factor) => <div key={factor.name}><dl className="method-factor-heading"><dt>{factor.name}<span>{factor.weight}% weight</span></dt><dd>{Math.round(factor.value * 100)}<small> / 100 normalized</small></dd></dl><div className="method-factor-track" aria-hidden="true"><span style={{ width: (factor.value * 100) + "%" }} /></div><p>{factor.description}</p></div>)}</div><div className="method-confidence"><div><h3>Confidence</h3><strong>{Math.round(topic.confidence * 100)}<small>% · {topic.confidenceLabel}</small></strong><p>Separate from Pulse Score. It describes the amount and consistency of sampled corroboration.</p></div><dl><div><dt>Evidence amount</dt><dd>{Math.round(topic.evidenceConfidence * 100)}%</dd></div><div><dt>Channel diversity</dt><dd>{Math.round(topic.diversityConfidence * 100)}%</dd></div><div><dt>Cluster consistency</dt><dd>{Math.round(topic.clusterConsistency * 100)}%</dd></div><div><dt>Channel balance</dt><dd>{Math.round(topic.sourceBalance * 100)}%</dd></div></dl></div><p className="method-guardrails">{topic.scoreCap < 100 ? "Evidence safeguards currently cap this topic at " + topic.scoreCap + "/100. " : ""}A single signal cannot become HOT. Repeated polls and syndicated copies are deduplicated. New topics have moderated velocity; displayed change uses a baseline floor of three signals and a 300% upper bound.</p><Link className="editorial-link" href="/about#scoring">Full equations & lifecycle thresholds ↗</Link></div></details></section>
    <RelatedSignals related={evidenceLinks(detail.relatedSignals)} mode={detail.mode} />
    <div className="topic-record-note"><span>{topic.count6h} signals in 6H · {topic.count24h} in 24H · growth ratio {topic.growthRatio.toFixed(2)}×</span><span>{detail.mode === "demo" ? "Demo snapshot " : "Collection "}<Timestamp value={detail.generatedAt} date={false} /> · evaluated <Timestamp value={detail.snapshot.evaluatedAt} date={false} /></span></div>
  </article>;
}
