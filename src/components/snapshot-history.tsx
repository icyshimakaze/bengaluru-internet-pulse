"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistorySnapshot } from "@/lib/domain/read-models";
import { formatDate, formatTime } from "@/lib/utils";

const windows = { "24h": 24, "7d": 7 * 24, "30d": 30 * 24 } as const;
export function SnapshotHistory({ history, evaluatedAt, mode, truncated }: {
  history: HistorySnapshot[]; evaluatedAt: string; mode: "demo" | "live"; truncated: boolean;
}) {
  const [period, setPeriod] = useState<keyof typeof windows>("24h");
  const [metric, setMetric] = useState<"score" | "signals">("score");
  const [version, setVersion] = useState<"v1" | "v2">(history.some((s) => s.algorithmVersion === "v2") ? "v2" : history.some((s) => s.algorithmVersion === "v1") ? "v1" : "v2");
  const versions = [...new Set(history.map((s) => s.algorithmVersion))].sort().reverse();
  const since = Date.parse(evaluatedAt) - windows[period] * 3_600_000;
  const rows = history.filter((s) => s.algorithmVersion === version && Date.parse(s.capturedAt) >= since && s.capturedAt <= evaluatedAt)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).map((s) => ({ ...s, value: metric === "score" ? s.pulseScore : s.count2h }));
  return <section className="topic-momentum" aria-labelledby="snapshot-heading">
    <div className="editorial-section-heading"><div><h2 id="snapshot-heading">Momentum over time</h2><p>{mode === "demo" ? "Deterministic replay of fictional evidence." : "Recorded snapshots from completed ingestion runs."}</p></div><div className="window-controls" role="group" aria-label="Snapshot history window">{(Object.keys(windows) as (keyof typeof windows)[]).map((window) => <button key={window} onClick={() => setPeriod(window)} aria-pressed={period === window}>{window.toUpperCase()}</button>)}</div></div>
    <div className="snapshot-toolbar"><div className="chart-metrics" role="group" aria-label="Snapshot chart metric"><button onClick={() => setMetric("score")} aria-pressed={metric === "score"}>Pulse Score</button><button onClick={() => setMetric("signals")} aria-pressed={metric === "signals"}>Signals · 2H</button></div><span className="snapshot-count mono">{rows.length} SNAPSHOTS · {version.toUpperCase()}</span>{versions.length > 1 && <label className="snapshot-version"><span className="sr-only">Scoring version</span><select aria-label="Scoring version" value={version} onChange={(e) => setVersion(e.target.value as "v1" | "v2")}><option value="v2">Scoring v2</option><option value="v1">v1 archive</option></select></label>}</div>
    {rows.length ? <figure className="snapshot-figure"><div className="snapshot-plot" role="img" aria-label={(metric === "score" ? "Recorded Pulse Scores" : "Recorded two-hour signal counts") + ", algorithm " + version + ". Exact values are in the table below."}><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={rows} margin={{ top: 18, right: 16, bottom: 7, left: -16 }} accessibilityLayer={false}>
      <CartesianGrid stroke="#ddded5" strokeDasharray="2 5" vertical={false} /><XAxis dataKey="capturedAt" tickFormatter={(value: string) => period === "24h" ? formatTime(value) : formatDate(value).replace(/ \d{4}$/, "")} minTickGap={65} tick={{ fill: "#62665d", fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis domain={metric === "score" ? [0, 100] : [0, "auto"]} allowDecimals={false} tick={{ fill: "#62665d", fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip labelFormatter={(label) => formatDate(String(label)) + " · " + formatTime(String(label)) + " IST"} formatter={(value) => [value, metric === "score" ? "Pulse Score / 100" : "Distinct signals / 2h"]} contentStyle={{ background: "#f8f7f2", border: "1px solid #ddded5", borderRadius: 0, boxShadow: "none", fontSize: 12 }} />
      <Line type="linear" dataKey="value" stroke="#11684f" strokeWidth={2} dot={rows.length <= 8 ? { r: 3 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
    </LineChart></ResponsiveContainer></div><figcaption>{metric === "score" ? "Pulse Score / 100" : "Distinct signals in the two hours before each snapshot"} · IST · {mode === "demo" ? "fixture replay at 30-minute intervals" : "saved ingestion snapshots"}{rows.length === 1 ? " · One recorded snapshot; no connecting trend is inferred." : ""}</figcaption></figure> : <div className="snapshot-empty"><h3>No snapshots in this window.</h3><p>{history.length ? "The topic has retained history outside this selection. Choose a wider window to inspect it." : "History appears after the first scoring snapshot is saved. Current metrics remain visible above."}</p>{period !== "30d" && history.length > 0 && <button className="editorial-link" onClick={() => setPeriod("30d")}>View retained history ↗</button>}</div>}
    {version === "v1" && <p className="snapshot-version-note">Archived v1 scores use the earlier equation. Current metrics use v2; the two versions are shown separately.</p>}
    <p className="snapshot-retention">Snapshots retained for 30 days.{truncated ? " Showing the most recent 96 records; earlier milestones may be absent." : ""} {mode === "demo" ? "These replayed records are fictional demo data." : "Gaps indicate missing captures, not zero activity."}</p>
    {rows.length > 0 && <details className="chart-data snapshot-table"><summary>View snapshot history as a table</summary><div className="snapshot-table-scroll" role="region" aria-label="Snapshot data table" tabIndex={0}><table><caption className="sr-only">Stored {version} snapshot history</caption><thead><tr><th scope="col">Captured (IST)</th><th scope="col">Pulse / 100</th><th scope="col">Signals · 2H</th><th scope="col">Sources · 2H</th><th scope="col">Lifecycle</th></tr></thead><tbody>{rows.map((row) => <tr key={row.capturedAt}><td><time dateTime={row.capturedAt}>{formatDate(row.capturedAt)} · {formatTime(row.capturedAt)}</time></td><td>{row.pulseScore}</td><td>{row.count2h}</td><td>{row.sourceCount}</td><td>{row.lifecycle}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
