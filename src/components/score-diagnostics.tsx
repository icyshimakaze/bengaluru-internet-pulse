import Link from "next/link";
import type { DashboardData } from "@/lib/domain/read-models";

export function ScoreDiagnostics({ topics, query }: { topics: DashboardData["diagnosticTopics"]; query: string }) {
  const shown = topics.filter((topic) => `${topic.title} ${topic.description} ${topic.neighborhood ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (!shown.length) return null;
  return <section className="score-diagnostics" aria-labelledby="diagnostic-scores-heading">
    <div className="editorial-section-heading"><div><div className="section-index mono">BELOW THE LEAD THRESHOLD</div>
      <h2 id="diagnostic-scores-heading">Pulse Scores · early signals</h2>
      <p>Actual scores for recent observations, ordered by latest evidence. These topics do not yet qualify for the lead ranking.</p>
    </div></div>
    <ul className="diagnostic-score-list">{shown.map((topic) => <li key={topic.slug}>
      <div><h3><Link href={`/topic/${topic.slug}`}>{topic.title}</Link></h3>
        <p>{topic.current2h} {topic.current2h === 1 ? "signal" : "signals"} / 2H · {Math.round(topic.confidence * 100)}% confidence</p>
        <small>{topic.current2h === 0 ? "No signals in the latest two hours; score has aged to zero." : "Early evidence · below the lead threshold."}</small></div>
      <div className="diagnostic-score"><strong>{topic.score}<span className="sr-only"> Pulse Score out of 100</span></strong><span>Pulse Score / 100</span></div>
    </li>)}</ul>
  </section>;
}
