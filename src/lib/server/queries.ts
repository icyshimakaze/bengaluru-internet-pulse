import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { getEnv } from "./env";
import { log } from "./logger";
import { getDatabase } from "@/lib/db/client";
import { ReadRepository } from "@/lib/db/read-repository";
import { slugSchema } from "@/lib/domain/schema";
import { readQuerySchema, dashboardQuerySchema, topicListQuerySchema, hotspotsResponseSchema, type ReadQuery, type ReadQueryInput, type DashboardQuery, type DashboardQueryInput } from "@/lib/domain/read-models";
import { emptyReadState, demoReadState, projectDashboard, projectTopic, projectHealth, projectTopicList } from "./projections";

export const READ_REVALIDATE_SECONDS = 15;
async function loadLive(slug?: string) {
  try { return await new ReadRepository(getDatabase()).load(new Date(), slug); }
  catch {
    log("error", "read.cache_refresh_failed", { code: "READ_UNAVAILABLE" });
    // Background revalidation must not let SDK error messages reach framework logs.
    throw new Error("READ_UNAVAILABLE");
  }
}
// Vercel can retain its data cache across deployments. Separate databases without
// placing their URLs or tokens in cache keys or serializing credentials.
const databaseKey = (url: string) => createHash("sha256").update(url).digest("hex");
const cachedLive = unstable_cache((_databaseKey: string) => { void _databaseKey; return loadLive(); }, ["pulse-read-v2"], { revalidate: READ_REVALIDATE_SECONDS });
const cachedTopicHistory = unstable_cache(async (_databaseKey: string, slug: string, capturedAt: string) => {
  void _databaseKey;
  try { return await new ReadRepository(getDatabase()).loadHistory(new Date(), slug, capturedAt); }
  catch {
    log("error", "read.cache_refresh_failed", { code: "READ_UNAVAILABLE" });
    throw new Error("READ_UNAVAILABLE");
  }
}, ["pulse-topic-history-v1"], { revalidate: READ_REVALIDATE_SECONDS });
const readContext = cache(async () => {
  const now = new Date();
  try {
    const env = getEnv();
    if (env.APP_DATA_MODE === "demo") return { state: demoReadState(now), notice: undefined };
    if (!env.TURSO_DATABASE_URL) return { state: emptyReadState(now), notice: "Live collection has not been connected yet." };
    const state = await cachedLive(databaseKey(env.TURSO_DATABASE_URL));
    // Time-based revalidation can serve an old value while refreshing. Bound
    // that age with one read-through; retain the validated cache on DB failure.
    if (now.getTime() - Date.parse(state.loadedAt) > 2 * READ_REVALIDATE_SECONDS * 1000) {
      try { return { state: await loadLive(), notice: undefined }; }
      catch { return { state, notice: "Snapshot refresh is delayed; the last validated read is shown." }; }
    }
    return { state, notice: undefined };
  } catch {
    log("error", "read.unavailable", { code: "READ_UNAVAILABLE" });
    return { state: emptyReadState(now), notice: "Live data is temporarily unavailable." };
  }
});
const readDashboardQuery = cache(async (window: DashboardQuery["window"], category: ReadQuery["category"], source: ReadQuery["source"]) => {
  const query = { window, category, source }, context = await readContext(), now = new Date();
  try { return projectDashboard(context.state, query, now, context.notice); }
  catch {
    log("error", "read.invalid_model", { code: "READ_MODEL_INVALID" });
    return projectDashboard(emptyReadState(now), query, now, "Live data is temporarily unavailable.");
  }
});
export async function readDashboard(input: DashboardQueryInput = {}) {
  const query = dashboardQuerySchema.parse(input);
  return readDashboardQuery(query.window, query.category, query.source);
}
export class ReadUnavailableError extends Error { constructor() { super("Live data unavailable"); this.name = "ReadUnavailableError"; } }
export async function readTopics(input: unknown = {}) {
  const query = topicListQuerySchema.parse(input), context = await readContext(), now = new Date();
  try { return projectTopicList(context.state, query, now, context.notice); }
  catch {
    log("error", "read.invalid_model", { code: "READ_MODEL_INVALID" });
    return projectTopicList(emptyReadState(now), query, now, "Live data is temporarily unavailable.");
  }
}
export const readTopic = cache(async (slug: string) => {
  slugSchema.parse(slug);
  const context = await readContext();
  if (!context.state.snapshot) throw new ReadUnavailableError();
  // Unknown slugs never create arbitrary persistent cache entries.
  if (!context.state.topics.some((t) => t.slug === slug)) return null;
  const now = new Date();
  try {
    const state = context.state.mode === "demo" ? demoReadState(now, slug) : { ...context.state,
      ...await cachedTopicHistory(databaseKey(getEnv().TURSO_DATABASE_URL!), slug, context.state.snapshot.generatedAt!) };
    if (!state.snapshot) throw new ReadUnavailableError();
    return projectTopic(state, slug, now);
  } catch {
    log("error", "read.topic_unavailable", { code: "TOPIC_READ_UNAVAILABLE" });
    throw new ReadUnavailableError();
  }
});
export async function readHotspots(input: ReadQueryInput = {}) {
  const dashboard = await readDashboard(readQuerySchema.parse(input));
  return hotspotsResponseSchema.parse({ mode: dashboard.mode, status: dashboard.status, generatedAt: dashboard.generatedAt,
    stale: dashboard.stale, snapshot: dashboard.snapshot, window: dashboard.window, hotspots: dashboard.hotspots,
    locationBasis: "Explicit neighborhood mentions; coordinates mark neighborhood centers, not verified incident locations" });
}
export async function readHealth() {
  const now = new Date(), empty = { generatedAt: null, sources: [], sourceRuns: [], collections: [], lastIngestion: null, lastSuccessfulIngestion: null, recentSignalCount: 0 };
  try {
    const env = getEnv();
    if (env.APP_DATA_MODE === "demo") {
      const state = demoReadState(now);
      return projectHealth({ ...empty, generatedAt: state.snapshot!.generatedAt, sources: state.snapshot!.sources, recentSignalCount: state.items.length }, now, "not_required", "demo");
    }
    if (!env.TURSO_DATABASE_URL) return projectHealth(empty, now, "unconfigured");
    return projectHealth(await new ReadRepository(getDatabase()).health(now), now);
  } catch {
    log("error", "read.health_unavailable", { code: "DATABASE_UNAVAILABLE" });
    return projectHealth(empty, now, "unavailable");
  }
}
