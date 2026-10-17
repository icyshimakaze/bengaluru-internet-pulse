import "server-only";
import { dashboardSchema, publicTopicSchema, topicDetailSchema, publicSignalSchema, publicSourceSchema, publicRunSchema,
  snapshotInfoSchema, publicHotspotSchema, historySnapshotSchema, healthSchema, topicListSchema, type ReadQuery, type PublicTopic, type TopicListQuery, type DashboardQuery } from "@/lib/domain/read-models";
import { sources, coordinates, sourceTypeFor, type SourceStatus, type Observation, type Source, type Pulse } from "@/lib/domain/schema";
import { evaluateTopics, deduplicateEvidence, HOUR, ALGORITHM_VERSION } from "@/lib/trends/engine";
import { toObservations, toDomainTopic, fromSignal } from "@/lib/db/mapping";
import type { ReadState, ReadRepository } from "@/lib/db/read-repository";
import { topicRecordSchema, type ItemRecord, type IngestionRun } from "@/lib/db/records";
import { demoDataset, demoPulse } from "@/fixtures/demo";
import { topicSnapshot } from "@/lib/trends/snapshots";
import { legacySemanticCategory, type EnrichmentResult } from "@/lib/domain/enrichment";
import { supportedLocation, evidenceHeadline } from "@/lib/trends/topic-presentation";
import { collectionState, type CollectionRecord } from "@/lib/domain/source-health";
import { activityWindows, meaningfulWindow } from "@/lib/trends/window-selection";
import { leadEligible } from "@/lib/trends/lead-eligibility";
import { detectLanguage } from "@/lib/domain/language";
import { filterSignal } from "@/lib/ingestion/filters.config";

export const STALE_MS = 90 * 60000;
const order = (a: PublicTopic, b: PublicTopic) => b.score - a.score || b.velocity - a.velocity || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
export function emptyReadState(now: Date): ReadState {
  return { mode: "live", loadedAt: now.toISOString(), snapshot: null, topics: [], items: [], sourceRuns: [], collections: [], semanticCategories: {},
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
  const fixtureCategories: Record<string, EnrichmentResult["category"]> = { "namma-metro": "traffic", "rain-and-waterlogging": "weather",
    "startup-ecosystem": "technology", "food-and-cafes": "food", "traffic-and-commutes": "traffic", "arts-and-events": "events" };
  return { ...emptyReadState(now), mode: "demo", topics, items, snapshot,
    semanticCategories: Object.fromEntries(topics.map((t) => [t.id, fixtureCategories[t.slug] ?? "other"])),
    // Replay the deterministic engine against only fixture evidence available at each time.
    history: descriptor ? Array.from({ length: 49 }, (_, index) => topicSnapshot(descriptor.id,
      data.observations.filter((o) => o.topicSlug === slug), new Date(now.getTime() - (48 - index) * HOUR / 2),
      undefined, undefined, toDomainTopic(descriptor))) : [] };
}
export function publicSources(stored: SourceStatus[], runs: IngestionRun[], now: Date, mode: Pulse["mode"], collections: CollectionRecord[] = []) {
  const optional = (source: Source) => source === "currents" || source === "rss";
  const latestCoreAttempt = [...stored.filter((s) => !optional(s.source)).map((s) => s.checkedAt),
    ...collections.filter((c) => !optional(c.health.source)).map((c) => c.lastAttemptAt),
    ...runs.filter((r) => !optional(r.source)).map((r) => r.startedAt)].sort().at(-1);
  // Read only persisted configuration/evidence; web reads never inspect API keys.
  const configured = sources.filter((source) => {
    const attempt = [...collections.filter((c) => c.health.source === source).map((c) => c.lastAttemptAt),
      ...runs.filter((r) => r.source === source).map((r) => r.startedAt)].sort().at(-1);
    return !optional(source) || mode !== "demo" && (stored.some((s) => s.source === source)
      || attempt !== undefined && (latestCoreAttempt === undefined || attempt >= latestCoreAttempt));
  });
  return configured.map((source) => {
    const storedSource = stored.find((s) => s.source === source), run = runs.find((r) => r.source === source);
    let health: SourceStatus = storedSource ?? { source, status: "unavailable", fetched: 0, accepted: 0, rejected: 0,
      durationMs: 0, checkedAt: now.toISOString() };
    if (mode === "live" && run?.finishedAt && (!storedSource || run.finishedAt >= storedSource.checkedAt)) health = {
      source, status: run.status === "completed" ? "ok" : run.status === "partial" ? "partial" : "error",
      fetched: run.discovered, accepted: run.inserted + run.duplicates, rejected: run.errors,
      durationMs: Date.parse(run.finishedAt) - Date.parse(run.startedAt), checkedAt: run.finishedAt,
    };
    const checkpoint = collections.find((c) => c.health.source === source);
    if (checkpoint) health = checkpoint.health;
    const { error: _error, ...safe } = health; void _error;
    const record: CollectionRecord = checkpoint ?? { health,
      lastAttemptAt: run?.startedAt ?? health.checkedAt,
      lastSuccessAt: ["ok", "partial", "demo"].includes(health.status) ? health.checkedAt : null,
      lastItemAt: null, lastErrorAt: ["error", "partial"].includes(health.status) ? health.checkedAt : null,
      lastErrorType: health.status === "error" ? "SOURCE_UNAVAILABLE" : health.status === "partial" ? "PARTIAL_QUERY_FAILURE" : null,
      itemsLastRun: health.accepted };
    const healthState = collectionState(record, now.getTime());
    return publicSourceSchema.parse({ ...safe, healthState,
      stale: !record.lastSuccessAt || now.getTime() - Date.parse(record.lastSuccessAt) > STALE_MS || Date.parse(record.lastSuccessAt) > now.getTime(),
      lastAttemptAt: record.lastAttemptAt, lastSuccessAt: record.lastSuccessAt, lastItemAt: record.lastItemAt,
      lastErrorAt: record.lastErrorAt, lastErrorType: record.lastErrorType, itemsLastRun: record.itemsLastRun,
      consecutiveFailures: record.consecutiveFailures,
      ingestionStatus: mode === "demo" ? null : run?.status ?? null });
  });
}
const available = (rows: ReturnType<typeof publicSources>): Source[] => rows.filter((s) => ["live", "delayed", "degraded", "demo"].includes(s.healthState)).map((s) => s.source);
function info(state: ReadState, query: ReadQuery, now: Date) {
  const capturedAt = state.snapshot?.generatedAt ?? null;
  const ageSeconds = capturedAt ? Math.max(0, (now.getTime() - Date.parse(capturedAt)) / 1000) : null;
  const cacheAgeSeconds = Math.max(0, (now.getTime() - Date.parse(state.loadedAt)) / 1000);
  return snapshotInfoSchema.parse({ algorithmVersion: ALGORITHM_VERSION, storedVersion: state.snapshot?.version ?? null,
    capturedAt, evaluatedAt: now.toISOString(), ageSeconds, scoringWindow: "2h", queryWindow: query.window,
    stale: ageSeconds === null || ageSeconds * 1000 > STALE_MS, cacheAgeSeconds, refreshDelayed: cacheAgeSeconds > 30 });
}
function publicSignal(item: ItemRecord, topics: ReadonlyMap<string, ReadState["topics"][number]>) {
  return publicSignalSchema.parse({ id: item.id, source: item.source, sourceType: sourceTypeFor[item.source],
    url: item.originalUrl, title: item.title, excerpt: item.excerpt.slice(0, 600), domain: item.domain, publishedAt: item.publishedAt,
    timeKind: item.timeKind, topicSlug: topics.get(item.topicId ?? "")?.slug ?? null, neighborhood: item.neighborhood,
    language: detectLanguage(`${item.title} ${item.excerpt}`),
    filterReason: item.filterReason ?? filterSignal(item), publisherName: item.publisherName ?? null,
    ...(item.filterReason === "job_posting" || filterSignal(item) === "job_posting" ? { observedCategory: "jobs" } : {}),
    enrichmentStatus: item.enrichmentStatus, enrichmentProvider: item.enrichmentProvider });
}
function selected(evidence: readonly Observation[], query: ReadQuery, now: Date) {
  const since = now.getTime() - Number.parseInt(query.window) * HOUR;
  return evidence.filter((o) => (query.window === "24h" ? Date.parse(o.publishedAt) >= since : Date.parse(o.publishedAt) > since)
    && Date.parse(o.publishedAt) <= now.getTime() && (!query.source || o.source === query.source));
}
export function metricTopics(state: ReadState, query: ReadQuery, now: Date) {
  const evidence = toObservations(state.items, state.topics);
  const records = new Map(state.topics.map((record) => [record.slug, record]));
  return evaluateTopics(state.topics.map(toDomainTopic), evidence, now).map((t) => {
    const { method: _method, currentCount: _current, baselineCount: _baseline, totalCount: _total, evidence: _evidence, ...safe } = t;
    void _method; void _current; void _baseline; void _total; void _evidence;
    const record = records.get(t.slug)!;
    const keywordLabel = state.mode === "live" && record.enrichmentMethod === "rules" && record.canonicalLabel === record.canonicalLabel.toLowerCase();
    const sourceHeadline = keywordLabel ? [...t.evidence].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id))
      .map((item) => evidenceHeadline(item.title)).find((title) => title !== null) : null;
    const activity = selected(t.evidence, { ...query, source: undefined }, now);
    const located = activity.filter((o) => o.neighborhood);
    const mentions = new Map<string, number>();
    for (const o of located) mentions.set(o.neighborhood!, (mentions.get(o.neighborhood!) ?? 0) + 1);
    const neighborhood = [...mentions].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? record.neighborhood;
    return { public: publicTopicSchema.parse({ ...safe, title: sourceHeadline ?? safe.title, activityCount: activity.length,
      semanticCategory: state.semanticCategories[record.id] ?? legacySemanticCategory[record.category], neighborhood }), evidence: t.evidence };
  });
}
function hotspotRows(topics: ReturnType<typeof metricTopics>, query: ReadQuery, now: Date) {
  const groups = new Map<string, { evidence: Observation[]; topics: Map<string, PublicTopic> }>();
  for (const t of topics) for (const o of selected(t.evidence, query, now)) {
    if (!o.neighborhood || !coordinates[o.neighborhood]) continue;
    const group = groups.get(o.neighborhood) ?? { evidence: [] as Observation[], topics: new Map<string, PublicTopic>() };
    group.evidence.push(o); group.topics.set(t.public.slug, t.public); groups.set(o.neighborhood, group);
  }
  return [...groups].map(([neighborhood, group]) => {
    const ranked = [...group.topics.values()].sort(order), top = ranked[0]!, count = group.evidence.length;
    const [lat, lng] = coordinates[group.evidence[0]!.neighborhood!]!;
    return publicHotspotSchema.parse({ neighborhood, lat, lng, count, activity: count, topics: ranked.map((t) => t.slug),
      averagePulse: Math.round(ranked.reduce((sum, t) => sum + t.score, 0) / ranked.length * 10) / 10,
      topPulse: top.score, topTopic: { slug: top.slug, title: top.title, pulseScore: top.score } });
  }).sort((a, b) => b.activity - a.activity || a.neighborhood.localeCompare(b.neighborhood));
}
const categoryMatches = (topic: PublicTopic, category: ReadQuery["category"]) => !category || topic.category === category || topic.semanticCategory === category;
function topicCandidates(metrics: ReturnType<typeof metricTopics>, query: ReadQuery, now: Date) {
  return metrics.filter((t) => t.public.activityCount >= 2 && categoryMatches(t.public, query.category)
    && (!query.source || selected(t.evidence, query, now).length > 0)).sort((a, b) => order(a.public, b.public));
}
function projectionStatus(state: ReadState, query: ReadQuery, now: Date, failureNotice?: string) {
  const snapshot = info(state, query, now), sourceStatuses = publicSources(state.snapshot?.sources ?? [], state.sourceRuns, now, state.mode, state.collections);
  let status: Pulse["status"] = state.mode === "demo" ? "demo" : !state.snapshot ? "unavailable" : state.snapshot.status;
  if (status === "healthy" && (snapshot.stale || snapshot.refreshDelayed || sourceStatuses.some((s) => s.stale || s.status !== "ok"))) status = "degraded";
  const notices = [failureNotice, state.snapshot?.notice,
    snapshot.stale && state.snapshot ? "The collection is over 90 minutes old; displayed metrics have been aged using the current time." : null,
    snapshot.refreshDelayed ? "The latest data refresh is delayed; showing the last available snapshot." : null,
    state.snapshot?.version === "v1" ? `Scoring updated to ${ALGORITHM_VERSION} using retained evidence; the collection timestamp is unchanged.` : null];
  return { snapshot, sourceStatuses, status,
    notice: notices.filter(Boolean).join(" ") || (status === "unavailable" ? "No live snapshot is available yet." : null) };
}
export function projectDashboard(state: ReadState, requested: DashboardQuery, now: Date, failureNotice?: string) {
  const baseQuery: ReadQuery = { ...requested, window: requested.window === "now" ? "24h" : requested.window };
  const baseMetrics = metricTopics(state, baseQuery, now);
  const records = new Map(state.topics.map((topic) => [topic.slug, topic]));
  const windows = new Map<ReadQuery["window"], ReturnType<typeof metricTopics>>();
  for (const window of requested.window === "now" ? activityWindows : [baseQuery.window]) {
    windows.set(window, window === baseQuery.window ? baseMetrics : baseMetrics.map((topic) => {
      const activity = selected(topic.evidence, { window }, now), mentions = new Map<string, number>();
      for (const signal of activity) if (signal.neighborhood) mentions.set(signal.neighborhood, (mentions.get(signal.neighborhood) ?? 0) + 1);
      const neighborhood = [...mentions].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? records.get(topic.public.slug)?.neighborhood ?? null;
      return { ...topic, public: publicTopicSchema.parse({ ...topic.public, activityCount: activity.length, neighborhood }) };
    }));
  }
  const effective = requested.window === "now" ? meaningfulWindow(activityWindows.map((window) => {
    const query: ReadQuery = { ...requested, window };
    const metrics = windows.get(window)!;
    return { window, topics: state.snapshot ? topicCandidates(metrics, query, now).filter((t) => leadEligible(t.public)).length : 0,
      signals: state.items.filter((item) => Date.parse(item.publishedAt) <= now.getTime()
        && Date.parse(item.publishedAt) > now.getTime() - Number.parseInt(window) * HOUR
        && item.enrichmentStatus !== "irrelevant" && (!query.source || item.source === query.source)
        && (!query.category || state.topics.some((topic) => topic.id === item.topicId
          && (topic.category === query.category || state.semanticCategories[topic.id] === query.category)))).length };
  })) : requested.window;
  const query: ReadQuery = { ...requested, window: effective };
  const { snapshot, sourceStatuses, status, notice } = projectionStatus(state, query, now, failureNotice);
  const metrics = windows.get(query.window)!, candidates = topicCandidates(metrics, query, now);
  const byId = new Map(state.items.map((i) => [i.id, i]));
  const topicsById = new Map(state.topics.map((topic) => [topic.id, topic]));
  // The same connected-identity dedupe protects pending stream rows and ranked evidence.
  const streams = deduplicateEvidence(state.items.filter((i) => i.enrichmentStatus !== "irrelevant" && (i.enrichmentStatus !== "completed" || i.localRelevance >= 0.5))
    .map((i) => ({ id: i.id, source: i.source, sourceId: i.sourceId, url: i.originalUrl, canonicalUrl: i.canonicalUrl, title: i.title,
      excerpt: i.excerpt, text: i.excerpt, domain: i.domain, sourceType: sourceTypeFor[i.source],
      publishedAt: i.publishedAt, collectedAt: i.collectedAt, contentHash: i.contentFingerprint, timeKind: i.timeKind,
      topicSlug: topicsById.get(i.topicId ?? "")?.slug ?? "unenriched", neighborhood: i.neighborhood })), now);
  const stream = selected(streams, query, now).filter((o) => {
    if (!query.category) return true;
    const item = byId.get(o.id)!, topic = topicsById.get(item.topicId ?? "");
    if ((item.filterReason ?? filterSignal(item)) === "job_posting") return query.category === "jobs";
    return topic && (topic.category === query.category || (state.semanticCategories[topic.id] ?? legacySemanticCategory[topic.category]) === query.category);
  })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  const visible = state.snapshot ? candidates : [];
  const rankedSlugs = new Set(visible.filter((t) => leadEligible(t.public)).map((t) => t.public.slug));
  // Singleton and quieter conversations remain discoverable without entering
  // the momentum ranking or receiving a fabricated popularity measure.
  const recentConversations = (state.snapshot ? baseMetrics : [])
    .filter((t) => !rankedSlugs.has(t.public.slug) && categoryMatches(t.public, query.category))
    .map((t) => ({ topic: t.public, evidence: selected(t.evidence, { ...query, window: "24h" }, now) }))
    .filter((t) => t.evidence.length > 0)
    .map(({ topic, evidence }) => ({ slug: topic.slug, title: topic.title, category: topic.semanticCategory,
      neighborhood: evidence.find((o) => o.neighborhood)?.neighborhood ?? null,
      latestAt: evidence.map((o) => o.publishedAt).sort().at(-1)!, signalCount: evidence.length, sources: [...new Set(evidence.map((o) => o.source))] }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt) || b.sources.length - a.sources.length || a.slug.localeCompare(b.slug)).slice(0, 8);
  return dashboardSchema.parse({ version: "v2", mode: state.mode, generatedAt: snapshot.capturedAt, evaluatedAt: snapshot.evaluatedAt,
    stale: snapshot.stale, status, totalSignals: state.snapshot ? deduplicateEvidence(toObservations(state.items, state.topics), now)
      .filter((item) => Date.parse(item.publishedAt) >= now.getTime() - 24 * HOUR).length : 0,
    notice, enrichment: state.snapshot?.enrichment,
    window: query.window, requestedWindow: requested.window, filters: { category: query.category ?? null, source: query.source ?? null }, snapshot,
    topTopics: visible.slice(0, 50).map((t) => t.public), risingTopics: visible.filter((t) => ["HOT", "RISING", "EMERGING"].includes(t.public.lifecycle)).slice(0, 50).map((t) => t.public),
    recentConversations, topicsTruncated: visible.length > 50, sourceStream: stream.slice(0, 30).map((o) => publicSignal(byId.get(o.id)!, topicsById)),
    signalCount: stream.length, streamTruncated: stream.length > 30, sources: sourceStatuses, availableSources: available(sourceStatuses),
    lastSuccessfulIngestion: state.mode === "demo" ? null : state.lastSuccessfulIngestion?.finishedAt ?? null,
    hotspots: hotspotRows(state.snapshot ? metrics.filter((t) => categoryMatches(t.public, query.category)) : [], query, now) });
}
export function projectTopicList(state: ReadState, query: TopicListQuery, now: Date, failureNotice?: string) {
  const { snapshot, status } = projectionStatus(state, query, now, failureNotice);
  const candidates = state.snapshot ? topicCandidates(metricTopics(state, query, now), query, now).filter((t) => (!query.lifecycle || t.public.lifecycle === query.lifecycle)
    && (!query.q || (t.public.title + " " + t.public.description).toLowerCase().includes(query.q.toLowerCase()))) : [];
  return topicListSchema.parse({ mode: state.mode, status, generatedAt: snapshot.capturedAt, stale: snapshot.stale,
    total: candidates.length, topics: candidates.slice(0, query.limit).map((t) => t.public), snapshot });
}
export function projectTopic(state: ReadState, slug: string, now: Date) {
  const query: ReadQuery = { window: "24h" }, { snapshot, status, notice } = projectionStatus(state, query, now);
  const metrics = metricTopics(state, query, now), match = metrics.find((t) => t.public.slug === slug);
  if (!match) return null;
  const byId = new Map(state.items.map((i) => [i.id, i]));
  const topicsById = new Map(state.topics.map((topic) => [topic.id, topic]));
  const evidence = match.evidence.slice(0, 30).map((o) => publicSignal(byId.get(o.id)!, topicsById));
  const neighborhoods = new Set(match.evidence.flatMap((o) => o.neighborhood ? [o.neighborhood] : []));
  const related = metrics.filter((t) => t.public.slug !== slug).flatMap((t) => t.evidence.filter((o) => t.public.semanticCategory !== "other" && t.public.semanticCategory === match.public.semanticCategory
    || o.neighborhood && neighborhoods.has(o.neighborhood))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id)).slice(0, 12);
  const history = state.history.map((s) => historySnapshotSchema.parse({ capturedAt: s.capturedAt, algorithmVersion: s.algorithmVersion,
    count2h: s.count2h, previousCount2h: s.previousCount2h, count6h: s.count6h, count24h: s.count24h, sourceCount: s.sourceCount,
    pulseScore: s.pulseScore, confidence: s.confidence, lifecycle: s.lifecycle, velocityScore: s.velocityScore, volumeScore: s.volumeScore,
    diversityScore: s.diversityScore, recencyScore: s.recencyScore }));
  const t = match.public;
  return topicDetailSchema.parse({ mode: state.mode, status, generatedAt: snapshot.capturedAt, stale: snapshot.stale,
    notice, snapshot, topic: t, summary: t.description, pulseScore: t.score,
    growth: { current2h: t.current2h, previous2h: t.previous2h, ratio: t.growthRatio, changePercent: t.growthPercent, capped: t.changeCapped },
    confidence: t.confidence, lifecycle: t.lifecycle, history, historyTruncated: state.historyTruncated, sourceEvidence: evidence,
    locationEvidence: supportedLocation(match.evidence),
    evidenceTruncated: match.evidence.length > 30, relatedSignals: related.map((o) => publicSignal(byId.get(o.id)!, topicsById)) });
}
export function projectHealth(data: Omit<Awaited<ReturnType<ReadRepository["health"]>>, "collections"> & { collections?: CollectionRecord[] }, now: Date, databaseStatus: "ok" | "unconfigured" | "unavailable" | "not_required" = "ok", mode: Pulse["mode"] = "live") {
  const rows = publicSources(data.sources, data.sourceRuns, now, mode, data.collections), generatedAt = data.generatedAt;
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
