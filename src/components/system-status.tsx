import type { DashboardData, HealthData } from "@/lib/domain/read-models";
import { sourceNames } from "@/lib/domain/source-labels";
import { formatDate, formatTime } from "@/lib/format";
import { pulseMetadata } from "@/lib/trends/dashboard-presentation";
import { statusLabel } from "@/lib/trends/status-label";

export function SystemStatus({ pulse, health }: { pulse: DashboardData; health: HealthData }) {
  return <article className="about-page status-page"><div className="eyebrow">Collection & publication</div>
    <h1>Behind the pulse</h1><p className="about-lead">{statusLabel(pulseMetadata(pulse), Date.parse(pulse.evaluatedAt))}</p>
    <p>Collection, topic matching and publication are measured separately. A successful poll with no matching results is healthy.</p>
    <h2>Collection</h2><dl className="system-source-list">{health.sources.map((source) => <div key={source.source}><dt>{sourceNames[source.source]}<small>{source.itemsLastRun} accepted last poll</small></dt><dd>{source.healthState}<small>{source.lastSuccessAt ? `${formatDate(source.lastSuccessAt)} · ${formatTime(source.lastSuccessAt)} IST` : "No recorded successful collection"}</small></dd></div>)}</dl>
    <h2>Enrichment</h2><dl className="system-facts"><div><dt>Selected provider</dt><dd>{pulse.enrichment?.run?.selectedProvider ?? pulse.enrichment?.provider ?? "Not recorded"}</dd></div><div><dt>Actual processing</dt><dd>{pulse.enrichment?.run?.actualProviders.join(" + ") || pulse.enrichment?.provider || "Not recorded"}</dd></div><div><dt>Heuristic fallback / recovery</dt><dd>{pulse.enrichment?.run?.fallbackCount ?? 0} signals</dd></div><div><dt>Awaiting topic matching</dt><dd>{pulse.enrichment?.pending ?? "Not recorded"}</dd></div></dl>
    <p>Heuristic matching is the free default. API fallback and local recovery are informational; neither alone makes collection degraded. Actual processing provenance remains recorded.</p>
    <h2>Publication</h2><dl className="system-facts"><div><dt>Database</dt><dd>{{ ok: "Healthy", unavailable: "Unavailable", unconfigured: "Not connected", not_required: "Not used in demo" }[health.database.status]}</dd></div><div><dt>Last snapshot</dt><dd>{pulse.generatedAt ? `${formatDate(pulse.generatedAt)} · ${formatTime(pulse.generatedAt)} IST` : "Awaiting publication"}</dd></div><div><dt>Read refresh</dt><dd>{pulse.snapshot.refreshDelayed ? "Delayed · cached evidence shown" : "Within refresh interval"}</dd></div></dl>
    <h2>What the labels mean</h2><p>Live: collection within 45 minutes. Delayed: 45–90 minutes or a delayed read. Stale: older than 90 minutes. Degraded: at least two consecutive failed or partial source polls, or stale source coverage. A single problem poll is Limited coverage. Source rows retain their compatible, more detailed health labels and actual timestamps. Missing storage or collection is shown explicitly. Demo is fictional.</p>
    <p>The compatibility health API retains its existing status and HTTP semantics, including enrichment-related degradation. This page separates that legacy aggregate from source collection.</p>
  </article>;
}
