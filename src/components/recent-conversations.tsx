"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DashboardData } from "@/lib/domain/read-models";
import { sourceNames } from "@/lib/domain/source-labels";
import { categoryLabels, elapsedLabel } from "@/lib/trends/dashboard-presentation";
import { usePulseStatus } from "./pulse-context";

export function RecentConversations({ conversations, query, demo }: {
  conversations: DashboardData["recentConversations"]; query: string; demo: boolean;
}) {
  const { now } = usePulseStatus();
  const shown = conversations.filter((topic) => `${topic.title} ${topic.neighborhood ?? ""} ${categoryLabels[topic.category]}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (!shown.length) return null;
  return <section className="recent-conversations" aria-labelledby="recent-conversations-heading">
    <div className="editorial-section-heading"><div><div className="section-index mono">BEYOND THE RANKING</div>
      <h2 id="recent-conversations-heading">Recently observed</h2>
      <p>Early mentions and quieter topics, from the last 24 hours{demo ? " of fictional demo evidence" : ""}.</p>
    </div><span className="panel-overline mono">24H / LATEST FIRST</span></div>
    <ol className="recent-conversation-list">{shown.map((topic) => <li key={topic.slug}>
      <div className="topic-kicker"><span>{categoryLabels[topic.category]}</span><time dateTime={topic.latestAt}>{elapsedLabel(topic.latestAt, now)}</time></div>
      <h3><Link href={`/topic/${topic.slug}`}>{topic.title}<ArrowUpRight size={15} aria-hidden="true" /></Link></h3>
      <p>{topic.signalCount} {topic.signalCount === 1 ? "signal" : "signals"} / 24H · {topic.sources.map((source) => sourceNames[source]).join(" + ")}</p>
      {topic.neighborhood && <span className="recent-conversation-place">{topic.neighborhood}</span>}
    </li>)}</ol>
  </section>;
}
