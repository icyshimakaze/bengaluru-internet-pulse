import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getEnv } from "./env";
import { log } from "./logger";
import { getDatabase } from "@/lib/db/client";
import { ReadRepository } from "@/lib/db/read-repository";
import { slugSchema } from "@/lib/domain/schema";
import { readQuerySchema, topicListQuerySchema, hotspotsResponseSchema, type ReadQueryInput } from "@/lib/domain/read-models";
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
const cachedLive = unstable_cache(() => loadLive(), ["pulse-read-v1"], { revalidate: READ_REVALIDATE_SECONDS });
const cachedTopic = unstable_cache((slug: string) => loadLive(slug), ["pulse-topic-read-v1"], { revalidate: READ_REVALIDATE_SECONDS });
const readContext = cache(async () => {
  const now = new Date();
  try {
    const env = getEnv();
    if (env.APP_DATA_MODE === "demo") return { state: demoReadState(now), notice: undefined };
    if (!env.TURSO_DATABASE_URL) return { state: emptyReadState(now), notice: "Live collection has not been connected yet." };
    return { state: await cachedLive(), notice: undefined };
  } catch {
    log("error", "read.unavailable", { code: "READ_UNAVAILABLE" });
    return { state: emptyReadState(now), notice: "Live data is temporarily unavailable." };
  }
});
export async function readDashboard(input: ReadQueryInput = {}) {
  const query = readQuerySchema.parse(input), context = await readContext(), now = new Date();
  try { return projectDashboard(context.state, query, now, context.notice); }
  catch {
    log("error", "read.invalid_model", { code: "READ_MODEL_INVALID" });
    return projectDashboard(emptyReadState(now), query, now, "Live data is temporarily unavailable.");
  }
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
  if (!context.state.snapshot || context.state.snapshot.status === "unavailable") throw new ReadUnavailableError();
  // Unknown slugs never create arbitrary persistent cache entries.
  if (!context.state.topics.some((t) => t.slug === slug)) return null;
  const now = new Date();
  try {
    const state = context.state.mode === "demo" ? demoReadState(now, slug) : await cachedTopic(slug);
    if (!state.snapshot) throw new ReadUnavailableError();
    return projectTopic(state, slug, now);
  } catch {
    log("error", "read.topic_unavailable", { code: "TOPIC_READ_UNAVAILABLE" });
    throw new ReadUnavailableError();
  }
});
export async function readHotspots(input: ReadQueryInput = {}) {
  const dashboard = await readDashboard(input);
  return hotspotsResponseSchema.parse({ mode: dashboard.mode, status: dashboard.status, generatedAt: dashboard.generatedAt,
    stale: dashboard.stale, snapshot: dashboard.snapshot, window: dashboard.window, hotspots: dashboard.hotspots,
    locationBasis: "Explicit neighborhood mentions; coordinates mark neighborhood centers, not verified incident locations" });
}
export async function readHealth() {
  const now = new Date(), empty = { generatedAt: null, sources: [], sourceRuns: [], lastIngestion: null, lastSuccessfulIngestion: null, recentSignalCount: 0 };
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
