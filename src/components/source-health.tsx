import type { HealthData } from "@/lib/domain/read-models";
import { sources, sourceNames } from "@/lib/domain/source-labels";
import { formatDate } from "@/lib/format";
import { sourceStateAt } from "@/lib/trends/dashboard-presentation";

const collectionTime = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
});

function sourceState(health: HealthData, source: (typeof sources)[number]) {
  const record = health.sources.find((item) => item.source === source);
  if (health.simulated || health.mode === "demo" || record?.status === "demo") return { label: "Demo", tone: "muted" };
  if (health.database.status !== "ok" || !record) {
    return { label: "Unavailable", tone: "unavailable" };
  }
  const state = sourceStateAt(record, Date.parse(health.application.checkedAt), health.mode);
  return { label: { live: "Live", delayed: "Delayed", degraded: "Degraded", stale: "Stale", error: "Error", unavailable: "Unavailable", demo: "Demo" }[state],
    tone: state === "live" ? "operational" : ["error", "unavailable"].includes(state) ? "unavailable" : "partial" };
}

export function SourceHealth({ health }: { health: HealthData }) {
  const demo = health.simulated || health.mode === "demo";
  const lastCollection = demo || health.database.status !== "ok" ? null : health.sources.flatMap((source) => source.lastSuccessAt ? [source.lastSuccessAt] : []).sort().at(-1) ?? health.lastSuccessfulIngestion;
  return <section id="source-health" className="about-source-health" aria-labelledby="source-health-heading">
    <h2 id="source-health-heading">Source health</h2>
    <div className="about-health-body">
      <dl className="about-health-sources">{sources.map((source) => {
        const state = sourceState(health, source);
        return <div key={source}><dt>{sourceNames[source]}</dt><dd className={`about-source-state source-state-${state.tone}`}>
          <span aria-hidden="true" className="signal-dot" />{state.label}
        </dd></div>;
      })}</dl>
      <div className="about-last-collection"><h3>Last successful collection</h3>
        {lastCollection ? <time dateTime={lastCollection}>
          <span>{collectionTime.format(new Date(lastCollection)).toUpperCase()} <small>IST</small></span>
          <span className="collection-date">{formatDate(lastCollection)}</span>
        </time> : <p>{demo ? "No live collection in demo mode" : health.database.status === "unavailable" ? "Temporarily unavailable" : "Awaiting first collection"}</p>}
      </div>
    </div>
    <p className="about-health-note">{demo ? "Fictional sources for this demo. No live collection has taken place." : "Reflects the latest recorded collection. Times are shown in IST."}</p>
  </section>;
}
