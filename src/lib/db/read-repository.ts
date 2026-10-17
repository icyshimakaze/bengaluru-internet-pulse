import "server-only";
import type { Client, InStatement } from "@libsql/client";
import { z } from "zod";
import { storedPulseSchema, sourceStatusSchema, slugSchema, pulseSchema, type Pulse } from "@/lib/domain/schema";
import { itemFromRow, topicFromRow, runFromRow, snapshotFromRow } from "./mapping";
import { DAY } from "./data-repository";
import { semanticCategorySchema } from "@/lib/domain/enrichment";
import { readCollections } from "./collection-repository";

const at = (now: Date) => z.date().parse(now).toISOString();
const sourceRuns = (until: string, fixture: boolean): InStatement => ({
  sql: `SELECT * FROM (SELECT *,row_number() OVER (PARTITION BY source ORDER BY started_at DESC,rowid DESC) AS position
    FROM ingestion_runs WHERE is_fixture=? AND started_at<=? AND (finished_at IS NULL OR finished_at<=?)) WHERE position=1 ORDER BY source`, args: [Number(fixture), until, until] });
const lastRun = (until: string, fixture: boolean, successful = false): InStatement => ({
  sql: `SELECT * FROM ingestion_runs WHERE is_fixture=? AND started_at<=? AND (finished_at IS NULL OR finished_at<=?) ${successful ? "AND (status='completed' OR (status='partial' AND discovered>errors))" : ""}
    ORDER BY ${successful ? "finished_at" : "started_at"} DESC,coalesce(finished_at,started_at) DESC,rowid DESC LIMIT 1`,
  args: [Number(fixture), until, until] });

// Dedicated read facade: no migration, model, source-fetch or mutation methods.
export class ReadRepository {
  constructor(private readonly client: Client) {}
  async loadHistory(now: Date, topicSlug: string, capturedAt: string, isFixture = false) {
    const until = at(now), slug = slugSchema.parse(topicSlug), ceiling = z.iso.datetime().parse(capturedAt);
    const fixture = z.boolean().parse(isFixture);
    if (ceiling > until) throw new Error("FUTURE_HISTORY_CEILING");
    // The parent read has already validated the topic and its atomic snapshot.
    // Never attach later history to an older cached snapshot.
    const rows = await this.client.execute({ sql: `SELECT s.* FROM topic_snapshots s JOIN topics t ON t.id=s.topic_id
      WHERE t.slug=? AND t.is_fixture=? AND s.captured_at>=? AND s.captured_at<=?
      ORDER BY s.captured_at DESC,s.algorithm_version DESC LIMIT 97`,
      args: [slug, Number(fixture), new Date(now.getTime() - 30 * DAY).toISOString(), ceiling] });
    const history = rows.rows.map(snapshotFromRow);
    return { history: history.slice(0, 96).reverse(), historyTruncated: history.length > 96 };
  }
  async load(now: Date, topicSlug?: string, isFixture = false) {
    const until = at(now), fixture = z.boolean().parse(isFixture), mode: Pulse["mode"] = fixture ? "demo" : "live";
    const since = new Date(now.getTime() - DAY).toISOString(), historySince = new Date(now.getTime() - 30 * DAY).toISOString();
    if (topicSlug !== undefined) slugSchema.parse(topicSlug);
    const statements: InStatement[] = [
      { sql: "SELECT payload,captured_at,mode FROM pulse_snapshots WHERE mode=? AND captured_at<=? ORDER BY captured_at DESC,rowid DESC LIMIT 1", args: [mode, until] },
      { sql: `SELECT t.* FROM topics t WHERE t.is_fixture=? AND (t.last_seen_at>=? OR EXISTS
        (SELECT 1 FROM topic_snapshots s WHERE s.topic_id=t.id AND s.captured_at>=?)) ORDER BY t.slug`, args: [Number(fixture), historySince, historySince] },
      { sql: `SELECT * FROM items WHERE is_fixture=? AND published_at<=? AND (published_at>=?
        OR (published_at>=? AND enrichment_status='completed' AND local_relevance>=0.5)) ORDER BY published_at DESC,id`,
        args: [Number(fixture), until, since, new Date(now.getTime() - 14 * DAY).toISOString()] },
      sourceRuns(until, fixture), lastRun(until, fixture), lastRun(until, fixture, true),
    ];
    if (topicSlug !== undefined) {
      statements.push({ sql: "SELECT * FROM topics WHERE slug=? AND is_fixture=?", args: [topicSlug, Number(fixture)] });
      statements.push({ sql: `SELECT s.* FROM topic_snapshots s JOIN topics t ON t.id=s.topic_id WHERE t.slug=? AND t.is_fixture=?
        AND s.captured_at>=? AND s.captured_at<=? ORDER BY s.captured_at DESC,s.algorithm_version DESC LIMIT 97`,
        args: [topicSlug, Number(fixture), historySince, until] });
    }
    statements.push({ sql: `SELECT e.topic_id,e.semantic_category FROM topic_enrichments e
      JOIN topics t ON t.id=e.topic_id WHERE t.is_fixture=?`, args: [Number(fixture)] });
    const [rows, collections] = await Promise.all([this.client.batch(statements, "read"), readCollections(this.client, now, fixture)]);
    const snapshot = rows[0]!.rows[0];
    const parsed = snapshot ? storedPulseSchema.parse(JSON.parse(String(snapshot.payload))) : null;
    if (parsed && (parsed.mode !== mode || parsed.generatedAt !== snapshot!.captured_at)) throw new Error("SNAPSHOT_IDENTITY_MISMATCH");
    const history = (topicSlug === undefined ? [] : rows[7]!.rows).map(snapshotFromRow);
    const requestedTopic = topicSlug === undefined ? undefined : rows[6]?.rows[0];
    const topics = rows[1]!.rows.map(topicFromRow);
    if (requestedTopic && !topics.some((t) => t.id === requestedTopic.id)) topics.push(topicFromRow(requestedTopic));
    const semanticCategories = z.record(z.string().min(1), semanticCategorySchema).parse(
      Object.fromEntries(rows.at(-1)!.rows.map((r) => [z.string().parse(r.topic_id), semanticCategorySchema.parse(r.semantic_category)])));
    return { mode, loadedAt: until, snapshot: parsed, collections,
      semanticCategories,
      topics, items: rows[2]!.rows.map(itemFromRow), sourceRuns: rows[3]!.rows.map(runFromRow),
      lastIngestion: rows[4]!.rows[0] ? runFromRow(rows[4]!.rows[0]) : null,
      lastSuccessfulIngestion: rows[5]!.rows[0] ? runFromRow(rows[5]!.rows[0]) : null,
      history: history.slice(0, 96).reverse(), historyTruncated: history.length > 96 };
  }

  async health(now: Date) {
    const until = at(now);
    const [rows, collections] = await Promise.all([this.client.batch([
      "SELECT 1 AS connected",
      { sql: `SELECT captured_at,json_extract(payload,'$.sources') AS sources,json_extract(payload,'$.mode') AS data_mode,
        json_extract(payload,'$.generatedAt') AS generated_at,json_extract(payload,'$.status') AS status FROM pulse_snapshots
        WHERE mode='live' AND captured_at<=? ORDER BY captured_at DESC,rowid DESC LIMIT 1`, args: [until] },
      sourceRuns(until, false), lastRun(until, false), lastRun(until, false, true),
      { sql: "SELECT count(*) AS count FROM items WHERE is_fixture=0 AND published_at>=? AND published_at<=?", args: [new Date(now.getTime() - DAY).toISOString(), until] },
    ], "read"), readCollections(this.client, now, false)]);
    z.literal(1).parse(rows[0]!.rows[0]?.connected);
    const snapshot = rows[1]!.rows[0];
    if (snapshot && (snapshot.data_mode !== "live" || snapshot.generated_at !== snapshot.captured_at)) throw new Error("SNAPSHOT_IDENTITY_MISMATCH");
    return { ...(snapshot ? { collectionStatus: pulseSchema.shape.status.parse(snapshot.status) } : {}),
      generatedAt: snapshot ? z.iso.datetime().parse(snapshot.captured_at) : null,
      sources: snapshot ? z.array(sourceStatusSchema).parse(JSON.parse(String(snapshot.sources))) : [], collections,
      sourceRuns: rows[2]!.rows.map(runFromRow), lastIngestion: rows[3]!.rows[0] ? runFromRow(rows[3]!.rows[0]) : null,
      lastSuccessfulIngestion: rows[4]!.rows[0] ? runFromRow(rows[4]!.rows[0]) : null,
      recentSignalCount: z.number().int().nonnegative().parse(rows[5]!.rows[0]?.count) };
  }
}
export type ReadState = Awaited<ReturnType<ReadRepository["load"]>>;
