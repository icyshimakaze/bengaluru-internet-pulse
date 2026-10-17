import "server-only";
import { z } from "zod";
import type { Client } from "@libsql/client";
import { sourceStatusSchema, type SourceStatus, type Signal } from "@/lib/domain/schema";
import { collectionRecordSchema } from "@/lib/domain/source-health";

export async function checkpointCollection(client: Client, input: SourceStatus, signals: Signal[], isFixture: boolean, attemptedAt: Date) {
  const health = sourceStatusSchema.parse(input);
  z.boolean().parse(isFixture); z.date().parse(attemptedAt);
  const success = ["ok", "partial", "demo"].includes(health.status);
  const failed = health.status === "error" || health.status === "partial";
  // Codes only: do not persist arbitrary provider errors in the public model.
  const code = failed ? health.error && /^[A-Z][A-Z0-9_]{0,79}$/u.test(health.error) ? health.error : "SOURCE_UNAVAILABLE" : null;
  const itemAt = signals.map((s) => z.iso.datetime().parse(s.publishedAt)).sort().at(-1) ?? null;
  const value = collectionRecordSchema.parse({ health, lastAttemptAt: attemptedAt.toISOString(),
    lastSuccessAt: success ? health.checkedAt : null, lastItemAt: itemAt,
    lastErrorAt: failed ? health.checkedAt : null, lastErrorType: code, itemsLastRun: health.accepted });
  await client.execute({ sql: `INSERT INTO source_collections
    (source,is_fixture,last_attempt_at,last_success_at,last_item_at,last_error_at,last_error_type,items_last_run,payload)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source,is_fixture) DO UPDATE SET
      last_attempt_at=excluded.last_attempt_at,
      last_success_at=coalesce(excluded.last_success_at,source_collections.last_success_at),
      last_item_at=CASE WHEN source_collections.last_item_at IS NULL THEN excluded.last_item_at
        WHEN excluded.last_item_at IS NULL THEN source_collections.last_item_at
        ELSE max(source_collections.last_item_at,excluded.last_item_at) END,
      last_error_at=coalesce(excluded.last_error_at,source_collections.last_error_at),
      last_error_type=coalesce(excluded.last_error_type,source_collections.last_error_type),
      items_last_run=excluded.items_last_run,payload=excluded.payload
    WHERE excluded.last_attempt_at>=source_collections.last_attempt_at`, args: [health.source, Number(isFixture), value.lastAttemptAt,
    value.lastSuccessAt, value.lastItemAt, value.lastErrorAt, value.lastErrorType, value.itemsLastRun, JSON.stringify(health)] });
}

export async function readCollections(client: Client, now: Date, isFixture: boolean) {
  // Web releases may precede the next ingestion migration. Reads never migrate.
  const table = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='source_collections'");
  if (!table.rows.length) return [];
  const rows = await client.execute({ sql: "SELECT * FROM source_collections WHERE is_fixture=? AND last_attempt_at<=? ORDER BY source",
    args: [Number(isFixture), now.toISOString()] });
  return rows.rows.map((row) => {
    const value = collectionRecordSchema.parse({ health: sourceStatusSchema.parse(JSON.parse(String(row.payload))),
      lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at, lastItemAt: row.last_item_at,
      lastErrorAt: row.last_error_at, lastErrorType: row.last_error_type, itemsLastRun: row.items_last_run });
    if (value.health.source !== row.source) throw new Error("COLLECTION_IDENTITY_MISMATCH");
    return value;
  });
}
