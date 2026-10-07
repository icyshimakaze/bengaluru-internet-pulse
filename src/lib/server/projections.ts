import "server-only";
import { dashboardSchema, publicTopicSchema, topicDetailSchema, publicSignalSchema, publicSourceSchema, publicRunSchema,
  snapshotInfoSchema, publicHotspotSchema, historySnapshotSchema, healthSchema, topicListSchema, type ReadQuery, type PublicTopic, type TopicListQuery } from "@/lib/domain/read-models";
import { sources, coordinates, type SourceStatus, type Observation, type Source, type Pulse } from "@/lib/domain/schema";
import { evaluateTopics, deduplicateEvidence, HOUR } from "@/lib/trends/engine";
import { toObservations, toDomainTopic, fromSignal } from "@/lib/db/mapping";
import type { ReadState, ReadRepository } from "@/lib/db/read-repository";
import { topicRecordSchema, type ItemRecord, type IngestionRun } from "@/lib/db/records";
import { demoDataset, demoPulse } from "@/fixtures/demo";
import { topicSnapshot } from "@/lib/trends/snapshots";

export const STALE_MS = 90 * 60000;
const order = (a: PublicTopic, b: PublicTopic) => b.score - a.score || b.velocity - a.velocity || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
export function emptyReadState(now: Date): ReadState {
  return { mode: "live", loadedAt: now.toISOString(), snapshot: null, topics: [], items: [], sourceRuns: [],
    lastIngestion: null, lastSuccessfulIngestion: null, history: [], historyTruncated: false };
}
export function demoReadState(now: Date, slug?: string): ReadState {
  const data = demoDataset(now), snapshot = demoPulse(now);
  const topics = data.topics.map((t) => {
    const dates = data.observations.filter((o) => o.topicSlug === t.slug).map((o) => o.publishedAt).sort();
    return topicRecordSchema.parse({ id: "demo-" + t.slug, slug: t.slug, canonicalLabel: t.title, category: t.category, neighborhood: null,
      firstSeenAt: dates[0], lastSeenAt: dates.at(-1), lifecycle: "inactive", pulseScore: 0, confidence: 0,
      summary: t.description, enrichmentMethod: t.method, isFixture: true });
  });
  const items = data.observations.map((o) => fromSignal(o, { topicId: "demo-" + o.topicSlug, category: topics.find((t) => t.slug === o.topicSlug)!.category,
    localRelevance: 1, enrichmentStatus: "completed", neighborhood: o.neighborhood, isFixture: true }));
  const descriptor = topics.find((t) => t.slug === slug);
  return { ...emptyReadState(now), mode: "demo", topics, items, snapshot,
    history: descriptor ? [topicSnapshot(descriptor.id, data.observations.filter((o) => o.topicSlug === slug), now, undefined, undefined, toDomainTopic(descriptor))] : [] };
}
export function publicSources(stored: SourceStatus[], runs: IngestionRun[], now: Date, mode: Pulse["mode"]) {
  return sources.map((source) => {
    const record = stored.find((s) => s.source === source), run = runs.find((r) => r.source === source);
    let health: SourceStatus = record ?? { source, status: "unavailable", fetched: 0, accepted: 0, rejected: 0,
      durationMs: 0, checkedAt: now.toISOString() };
    if (mode === "live" && run?.finishedAt && (!record || run.finishedAt >= record.checkedAt)) health = {
      source, status: run.status === "completed" ? "ok" : run.status === "partial" ? "partial" : "error",
      fetched: run.discovered, accepted: run.inserted + run.duplicates, rejected: run.errors,
      durationMs: Date.parse(run.finishedAt) - Date.parse(run.startedAt), checkedAt: run.finishedAt,
    };
    const { error: _error, ...safe } = health; void _error;
    return publicSourceSchema.parse({ ...safe, stale: now.getTime() - Date.parse(health.checkedAt) > STALE_MS || Date.parse(health.checkedAt) > now.getTime(),
      ingestionStatus: mode === "demo" ? null : run?.status ?? null });
  });
}
const available = (rows: ReturnType<typeof publicSources>): Source[] => rows.filter((s) => !s.stale && ["ok", "partial", "demo"].includes(s.status)).map((s) => s.source);
function info(state: ReadState, query: ReadQuery, now: Date) {
  const capturedAt = state.snapshot?.generatedAt ?? null;
  const ageSeconds = capturedAt ? Math.max(0, (now.getTime() - Date.parse(capturedAt)) / 1000) : null;
  const cacheAgeSeconds = Math.max(0, (now.getTime() - Date.parse(state.loadedAt)) / 1000);
  return snapshotInfoSchema.parse({ algorithmVersion: "v2", storedVersion: state.snapshot?.version ?? null,
    capturedAt, evaluatedAt: now.toISOString(), ageSeconds, scoringWindow: "2h", queryWindow: query.window,
    stale: ageSeconds === null || ageSeconds * 1000 > STALE_MS, cacheAgeSeconds, refreshDelayed: cacheAgeSeconds > 30 });
}
function publicSignal(item: ItemRecord, topics: ReadState["topics"]) {
  return publicSignalSchema.parse({ id: item.id, source: item.source, sourceType: item.source === "gdelt" ? "news" : item.source === "bluesky" ? "social" : "tech",
    url: item.originalUrl, title: item.title, excerpt: item.excerpt.slice(0, 600), domain: item.domain, publishedAt: item.publishedAt,
    timeKind: item.timeKind, topicSlug: topics.find((t) => t.id === item.topicId)?.slug ?? null, neighborhood: item.neighborhood,
    enrichmentStatus: item.enrichmentStatus });
}
function selected(evidence: readonly Observation[], query: ReadQuery, now: Date) {
  const since = now.getTime() - Number.parseInt(query.window) * HOUR;
  return evidence.filter((o) => (query.window === "24h" ? Date.parse(o.publishedAt) >= since : Date.parse(o.publishedAt) > since)
    && Date.parse(o.publishedAt) <= now.getTime() && (!query.source || o.source === query.source));
}
export function metricTopics(state: ReadState, query: ReadQuery, now: Date) {
  const evidence = toObservations(state.items, state.topics);
  return evaluateTopics(state.topics.map(toDomainTopic), evidence, now).map((t) => {
    const { method: _method, currentCount: _current, baselineCount: _baseline, totalCount: _total, evidence: _evidence, ...safe } = t;
    void _method; void _current; void _baseline; void _total; void _evidence;
    return { public: publicTopicSchema.parse({ ...safe, activityCount: selected(t.evidence, { ...query, source: undefined }, now).length }), evidence: t.evidence };
  });
}
function hotspotRows(topics: ReturnType<typeof metricTopics>, query: ReadQuery, now: Date) {
  const groups = new Map<string, { evidence: Observation[]; topics: Map<string, PublicTopic> }>();
  for (const t of topics) for (const o of selected(t.evidence, query, now)) {
    if (!o.neighborhood) continue;
    const group = groups.get(o.neighborhood) ?? { evidence: [] as Observation[], topics: new Map<string, PublicTopic>() };
    group.evidence.push(o); group.topics.set(t.public.slug, t.public); groups.set(o.neighborhood, group);
  }
  return [...groups].map(([neighborhood, group]) => {
    const ranked = [...group.topics.values()].sort(order), top = ranked[0]!, count = group.evidence.length;
    const [lat, lng] = coordinates[group.evidence[0]!.neighborhood!];
    return publicHotspotSchema.parse({ neighborhood, lat, lng, count, activity: count, topics: ranked.map((t) => t.slug),
      averagePulse: Math.round(ranked.reduce((sum, t) => sum + t.score, 0) / ranked.length * 10) / 10,
      topPulse: top.score, topTopic: { slug: top.slug, title: top.title, pulseScore: top.score } });
  }).sort((a, b) => b.activity - a.activity || a.neighborhood.localeCompare(b.neighborhood));
}
function topicCandidates(state: ReadState, query: ReadQuery, now: Date) {
  return metricTopics(state, query, now).filter((t) => t.public.activityCount >= 2 && (!query.category || t.public.category === query.category)
    && (!query.source || selected(t.evidence, query, now).length > 0)).sort((a, b) => order(a.public, b.public));
}
export function projectDashboard(state: ReadState, query: ReadQuery, now: Date, failureNotice?: string) {
  const snapshot = info(state, query, now), sourceStatuses = publicSources(state.snapshot?.sources ?? [], state.sourceRuns, now, state.mode);
  const candidates = topicCandidates(state, query, now);
  const byId = new Map(state.items.map((i) => [i.id, i]));
  // The same connected-identity dedupe protects pending stream rows and ranked evidence.
  const streams = deduplicateEvidence(state.items.filter((i) => i.enrichmentStatus !== "irrelevant" && (i.enrichmentStatus !== "completed" || i.localRelevance >= 0.5))
    .map((i) => ({ id: i.id, source: i.source, sourceId: i.sourceId, url: i.originalUrl, canonicalUrl: i.canonicalUrl, title: i.title,
      excerpt: i.excerpt, text: i.excerpt, domain: i.domain, sourceType: i.source === "gdelt" ? "news" as const : i.source === "bluesky" ? "social" as const : "tech" as const,
      publishedAt: i.publishedAt, collectedAt: i.collectedAt, contentHash: i.contentFingerprint, timeKind: i.timeKind,
      topicSlug: state.topics.find((t) => t.id === i.topicId)?.slug ?? "unenriched", neighborhood: i.neighborhood })), now);
  const stream = selected(streams, query, now).filter((o) => !query.category || byId.get(o.id)?.category === query.category)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  let status: Pulse["status"] = state.mode === "demo" ? "demo" : !state.snapshot ? "unavailable" : state.snapshot.status;
  if (status === "healthy" && (snapshot.stale || snapshot.refreshDelayed || sourceStatuses.some((s) => s.stale || s.status !== "ok"))) status = "degraded";
  const notices = [failureNotice, state.snapshot?.notice,
    snapshot.stale && state.snapshot ? "The collection is over 90 minutes old; displayed metrics have been aged using the current time." : null,
    snapshot.refreshDelayed ? "Read-model refresh is delayed; showing the last validated cached data." : null,
    state.snapshot?.version === "v1" ? "Scoring updated to v2 using retained evidence; the collection timestamp is unchanged." : null];
  const visible = state.snapshot ? candidates : [];
  return dashboardSchema.parse({ version: "v2", mode: state.mode, generatedAt: snapshot.capturedAt, evaluatedAt: snapshot.evaluatedAt,
    stale: snapshot.stale, status, totalSignals: state.snapshot?.totalSignals ?? 0,
    notice: notices.filter(Boolean).join(" ") || (status === "unavailable" ? "No live snapshot is available yet." : null), enrichment: state.snapshot?.enrichment,
    window: query.window, filters: { category: query.category ?? null, source: query.source ?? null }, snapshot,
    topTopics: visible.slice(0, 50).map((t) => t.public), risingTopics: visible.filter((t) => ["HOT", "RISING", "EMERGING"].includes(t.public.lifecycle)).slice(0, 50).map((t) => t.public),
    topicsTruncated: visible.length > 50, sourceStream: stream.slice(0, 30).map((o) => publicSignal(byId.get(o.id)!, state.topics)),
    signalCount: stream.length, streamTruncated: stream.length > 30, sources: sourceStatuses, availableSources: available(sourceStatuses),
    lastSuccessfulIngestion: state.mode === "demo" ? null : state.lastSuccessfulIngestion?.finishedAt ?? null,
    hotspots: hotspotRows(state.snapshot ? metricTopics(state, query, now).filter((t) => !query.category || t.public.category === query.category) : [], query, now) });
}
export function projectTopicList(state: ReadState, query: TopicListQuery, now: Date, failureNotice?: string) {
  const dashboard = projectDashboard(state, query, now, failureNotice);
  const candidates = state.snapshot ? topicCandidates(state, query, now).filter((t) => (!query.lifecycle || t.public.lifecycle === query.lifecycle)
    && (!query.q || (t.public.title + " " + t.public.description).toLowerCase().includes(query.q.toLowerCase()))) : [];
  return topicListSchema.parse({ mode: state.mode, status: dashboard.status, generatedAt: dashboard.generatedAt, stale: dashboard.stale,
    total: candidates.length, topics: candidates.slice(0, query.limit).map((t) => t.public), snapshot: dashboard.snapshot });
}
export function projectTopic(state: ReadState, slug: string, now: Date) {
  const query: ReadQuery = { window: "24h" }, dashboard = projectDashboard(state, query, now);
  const metrics = metricTopics(state, query, now), match = metrics.find((t) => t.public.slug === slug);
  if (!match) return null;
  const byId = new Map(state.items.map((i) => [i.id, i]));
  const evidence = match.evidence.slice(0, 30).map((o) => publicSignal(byId.get(o.id)!, state.topics));
  const neighborhoods = new Set(match.evidence.flatMap((o) => o.neighborhood ? [o.neighborhood] : []));
  const related = metrics.filter((t) => t.public.slug !== slug).flatMap((t) => t.evidence.filter((o) => t.public.category === match.public.category
    || o.neighborhood && neighborhoods.has(o.neighborhood))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id)).slice(0, 12);
  const history = state.history.map((s) => historySnapshotSchema.parse({ capturedAt: s.capturedAt, algorithmVersion: s.algorithmVersion,
    count2h: s.count2h, previousCount2h: s.previousCount2h, count6h: s.count6h, count24h: s.count24h, sourceCount: s.sourceCount,
    pulseScore: s.pulseScore, confidence: s.confidence, lifecycle: s.lifecycle, velocityScore: s.velocityScore, volumeScore: s.volumeScore,
    diversityScore: s.diversityScore, recencyScore: s.recencyScore }));
  const t = match.public;
  return topicDetailSchema.parse({ mode: state.mode, status: dashboard.status, generatedAt: dashboard.generatedAt, stale: dashboard.stale,
    notice: dashboard.notice, snapshot: dashboard.snapshot, topic: t, summary: t.description, pulseScore: t.score,
    growth: { current2h: t.current2h, previous2h: t.previous2h, ratio: t.growthRatio, changePercent: t.growthPercent, capped: t.changeCapped },
    confidence: t.confidence, lifecycle: t.lifecycle, history, historyTruncated: state.historyTruncated, sourceEvidence: evidence,
    evidenceTruncated: match.evidence.length > 30, relatedSignals: related.map((o) => publicSignal(byId.get(o.id)!, state.topics)) });
}
export function projectHealth(data: Awaited<ReturnType<ReadRepository["health"]>>, now: Date, databaseStatus: "ok" | "unconfigured" | "unavailable" | "not_required" = "ok", mode: Pulse["mode"] = "live") {
  const rows = publicSources(data.sources, data.sourceRuns, now, mode), generatedAt = data.generatedAt;
  const stale = !generatedAt || now.getTime() - Date.parse(generatedAt) > STALE_MS;
  const status: Pulse["status"] = mode === "demo" ? "demo" : databaseStatus !== "ok" || !generatedAt || data.collectionStatus === "unavailable" ? "unavailable"
    : stale || data.collectionStatus === "degraded" || rows.some((s) => s.stale || s.status !== "ok") ? "degraded" : "healthy";
  const safeRun = data.lastIngestion ? publicRunSchema.parse({ source: data.lastIngestion.source, startedAt: data.lastIngestion.startedAt,
    finishedAt: data.lastIngestion.finishedAt, status: data.lastIngestion.status, discovered: data.lastIngestion.discovered,
    inserted: data.lastIngestion.inserted, duplicates: data.lastIngestion.duplicates, errors: data.lastIngestion.errors }) : null;
  return healthSchema.parse({ status, mode, version: "v2", generatedAt, stale, application: { status: "ok", checkedAt: now.toISOString() },
    database: { status: databaseStatus, checkedAt: now.toISOString() }, lastIngestion: mode === "demo" ? null : safeRun,
    lastSuccessfulIngestion: mode === "demo" ? null : data.lastSuccessfulIngestion?.finishedAt ?? null, sources: rows, availableSources: available(rows),
    recentSignalCount: ["unconfigured", "unavailable"].includes(databaseStatus) ? null : data.recentSignalCount, recentWindow: "24h", simulated: mode === "demo" });
}
