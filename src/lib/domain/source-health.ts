import { z } from "zod";
import { sourceStatusSchema } from "./schema";

export { collectionState, SOURCE_DELAYED_MS, SOURCE_STALE_MS } from "@/lib/trends/source-health-state";
export const collectionRecordSchema = z.object({
  health: sourceStatusSchema,
  lastAttemptAt: z.iso.datetime(), lastSuccessAt: z.iso.datetime().nullable(),
  lastItemAt: z.iso.datetime().nullable(), lastErrorAt: z.iso.datetime().nullable(),
  lastErrorType: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/u).nullable(),
  itemsLastRun: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative().optional(),
}).strict();
export type CollectionRecord = z.infer<typeof collectionRecordSchema>;
export const sourceHealthStateSchema = z.enum(["live", "delayed", "degraded", "stale", "error", "unavailable", "demo"]);
export type SourceHealthState = z.infer<typeof sourceHealthStateSchema>;

