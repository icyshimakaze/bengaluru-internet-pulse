"use client";
import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PublicTopic } from "@/lib/domain/read-models";
import { chartHistory, type ChartHistoryData } from "@/lib/trends/chart-history";
import { abortableRead } from "@/lib/client/abortable-read";
import { formatDate, formatTime } from "@/lib/format";
import { LazyLinePlot } from "./lazy-line-plot";

export const MomentumChart = memo(function MomentumChart({ topics, initialDetail, mode, capturedAt }: { topics: PublicTopic[]; initialDetail: ChartHistoryData | null; mode: "demo" | "live"; capturedAt: string | null }) {
  const [selection, setSelection] = useState(topics[0]?.slug ?? "");
  const [view, setView] = useState<"score" | "signals">("score");
  const [detail, setDetail] = useState(initialDetail), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const topic = topics.find((t) => t.slug === selection) ?? topics[0];
  const slug = topic?.slug;
  const validDetail = detail && detail.topicSlug === slug && detail.mode === mode && (mode === "demo" || !!detail.generatedAt && !!capturedAt && detail.generatedAt >= capturedAt) ? detail : null;
  useEffect(() => {
    if (!slug || (validDetail && retry === 0)) return;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10_000);
    let cancelled = false;
    abortableRead(Promise.all([fetch("/api/topics/" + encodeURIComponent(slug), { signal: controller.signal, cache: "no-store" }), import("@/lib/domain/read-models")]), controller.signal).then(async ([response, { topicDetailSchema }]) => {
      if (!response.ok) throw new Error("HISTORY_UNAVAILABLE");
      const next = topicDetailSchema.parse(await response.json());
      if (next.topic.slug !== slug || next.mode !== mode || mode === "live" && (!next.generatedAt || !!capturedAt && next.generatedAt < capturedAt)) throw new Error("HISTORY_MISMATCH");
      if (!controller.signal.aborted) { setDetail(chartHistory(next)); setError(false); setRetry(0); }
    }).catch(() => { if (!cancelled) setError(true); }).finally(() => clearTimeout(deadline));
    return () => { cancelled = true; clearTimeout(deadline); controller.abort(); };
  }, [slug, mode, capturedAt, retry, validDetail]);
  const rows = useMemo(() => view === "signals" ? topic?.history.map((h) => ({ at: h.at, value: h.count })) ?? []
    : validDetail?.history.filter((h) => h.algorithmVersion === "v2" && Date.parse(h.capturedAt) >= Date.parse(validDetail.evaluatedAt) - 86_400_000)
      .map((h) => ({ at: h.capturedAt, value: h.pulseScore })) ?? [], [view, topic, validDetail]);
  const loading = view === "score" && !!topic && !validDetail && !error;
  return <section className="momentum-panel" aria-labelledby="momentum-heading">
    <div className="editorial-section-heading"><div><h2 id="momentum-heading">Momentum over time</h2><p>{mode === "demo" ? "Fictional evidence · recorded score history" : "Recorded score history"}</p></div><span className="panel-overline mono">LAST 24H</span></div>
    {topic ? <>
      <div className="chart-toolbar"><label><span className="sr-only">Chart topic</span><select aria-label="Chart topic" value={topic.slug} onChange={(e) => { setSelection(e.target.value); setError(false); setRetry(0); }}>{topics.map((t) => <option key={t.slug} value={t.slug}>{t.title}</option>)}</select></label><div role="group" aria-label="Chart metric" className="chart-metrics"><button aria-pressed={view === "score"} onClick={() => setView("score")}>Pulse Score</button><button aria-pressed={view === "signals"} onClick={() => setView("signals")}>Signals</button></div></div>
      <p className="chart-context">{view === "score" ? "Pulse Score / 100 · successive 2h windows" : "Distinct signals per hour · all contributing sources"}</p>
      {loading ? <div className="momentum-chart chart-placeholder" role="status">Loading recorded history…</div> : error && view === "score" && !validDetail ? <div className="momentum-chart chart-placeholder"><p>Score history could not be loaded.</p><button className="editorial-link" onClick={() => { setError(false); setRetry((n) => n + 1); }}>Retry history ↗</button><button className="editorial-link" onClick={() => setView("signals")}>View signal activity ↗</button></div> : rows.length ? <figure className="momentum-figure"><div className="momentum-chart" role="img" aria-label={topic.title + " " + (view === "score" ? "Pulse Score history" : "hourly distinct signals") + ". Exact values are available in the table below."}><LazyLinePlot rows={rows} metric={view} variant="momentum" /></div><figcaption>{view === "score" ? (mode === "demo" ? "Fixture replay · 30-minute scoring intervals" : "Saved ingestion snapshots · scoring v2") : "Distinct signals per hour"} · IST{rows.length === 1 ? " · Only one snapshot is available." : ""}{validDetail?.historyTruncated && view === "score" ? " · History limited to the most recent 96 snapshots." : ""}</figcaption></figure> : <div className="momentum-chart chart-placeholder">No v2 scoring snapshots in the last 24 hours. Switch to Signals to inspect evidence.</div>}
      {rows.length > 0 && <details className="chart-data"><summary>View {view === "score" ? "score history" : "signal activity"} as a table</summary><div className="chart-table-scroll"><table><caption className="sr-only">{topic.title} · {view === "score" ? "Pulse Score snapshots" : "hourly distinct signals"}</caption><thead><tr><th scope="col">Time (IST)</th><th scope="col">{view === "score" ? "Pulse Score / 100" : "Distinct signals"}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.at}><td><time dateTime={r.at}>{formatDate(r.at)} · {formatTime(r.at)}</time></td><td>{r.value}</td></tr>)}</tbody></table></div></details>}
      <Link href={"/topic/" + topic.slug} className="chart-detail-link editorial-link">Inspect {topic.title} ↗</Link>
    </> : <div className="chart-no-data"><p>No topic history in this selection.</p><span>Choose another category or time window to explore momentum.</span></div>}
  </section>;
});
