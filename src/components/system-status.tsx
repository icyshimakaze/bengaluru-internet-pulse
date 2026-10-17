"use client";
import { useRef, useState } from "react";
import { X, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePulseStatus } from "./pulse-context";
import { elapsedLabel, isLive, sourceStateAt } from "@/lib/trends/dashboard-presentation";
import { sourceNames } from "@/lib/domain/source-labels";
import { formatDate, formatTime } from "@/lib/format";
import type { HealthData } from "@/lib/domain/read-models";

export function SystemStatus() {
  const { pulse, now } = usePulseStatus();
  const dialog = useRef<HTMLDialogElement>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [failed, setFailed] = useState(false);
  const live = isLive(pulse, now);
  const label = pulse.mode === "demo" ? "DEMO" : live ? pulse.status === "healthy" ? "LIVE" : "DEGRADED" : "DELAYED";
  async function open() {
    dialog.current?.showModal();
    setFailed(false);
    try {
      const [response, { healthSchema }] = await Promise.all([fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(10_000) }), import("@/lib/domain/read-models")]);
      setHealth(healthSchema.parse(await response.json()));
    } catch { setHealth(null); setFailed(true); }
  }
  const rows = health?.sources ?? pulse.sources ?? [];
  return <>
    <button className={`live-indicator ${live ? "is-live" : "is-delayed"}`} aria-haspopup="dialog" aria-label={`System status: ${label}`} onClick={() => void open()}>
      <span aria-hidden="true" className="signal-dot" /><span>{label}</span><span className="status-mode">View system status</span>
    </button>
    <dialog ref={dialog} className="system-dialog" aria-labelledby="system-heading" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="system-dialog-header"><div><span className="panel-overline">BENGALURU PULSE / STATUS</span><h2 id="system-heading">Behind the pulse</h2></div><button aria-label="Close system status" className="icon-button" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <p className="system-intro">Collection, topic matching and publication are measured separately.</p>
      <h3>Collection</h3><dl className="system-source-list">{rows.map((source) => <div key={source.source}><dt>{sourceNames[source.source]}<small>{source.itemsLastRun} accepted last poll</small></dt><dd><span className={`source-health-label state-${sourceStateAt(source, now, pulse.mode)}`}>{sourceStateAt(source, now, pulse.mode)}</span><small>{pulse.mode === "demo" ? "Simulated" : elapsedLabel(source.lastSuccessAt, now)}</small></dd></div>)}</dl>
      <h3>Enrichment</h3><dl className="system-facts"><div><dt>Selected provider</dt><dd>{pulse.enrichment?.run?.selectedProvider ?? pulse.enrichment?.provider ?? "Not recorded"}</dd></div><div><dt>Actual processing</dt><dd>{pulse.enrichment?.run?.actualProviders.join(" + ") || pulse.enrichment?.provider || "Not recorded"}</dd></div><div><dt>Heuristic fallback / recovery</dt><dd>{pulse.enrichment?.run?.fallbackCount ?? 0} signals</dd></div><div><dt>Awaiting topic matching</dt><dd>{pulse.enrichment?.pending ?? "Not recorded"}</dd></div></dl>
      <h3>Publication</h3><dl className="system-facts"><div><dt>Database</dt><dd>{failed ? "Health check unavailable" : health ? ({ ok: "Healthy", unavailable: "Unavailable", unconfigured: "Not connected", not_required: "Not used in demo" })[health.database.status] : "Checking…"}</dd></div><div><dt>Last snapshot</dt><dd>{pulse.generatedAt ? `${formatDate(pulse.generatedAt)} · ${formatTime(pulse.generatedAt)} IST` : "Awaiting publication"}</dd></div><div><dt>Read refresh</dt><dd>{pulse.snapshot.refreshDelayed ? "Delayed · cached evidence shown" : "Within refresh interval"}</dd></div></dl>
      <p className="system-note">A successful poll with no matching results is healthy. Enrichment fallback does not mean a source failed.</p><Link href="/about#source-health" className="editorial-link" onClick={() => dialog.current?.close()}>Coverage & methodology <ArrowUpRight size={14} /></Link>
    </dialog>
  </>;
}
