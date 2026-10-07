import type { Signal, SourceStatus } from "@/lib/domain/schema";
export type { NormalizedSignal } from "@/lib/domain/schema";
export type SourceResult = { signals: Signal[]; health: SourceStatus };
export type SourceAdapter = (now: Date, timeoutMs: number) => Promise<SourceResult>;
export type AdapterOptions = { budgetMs?: number };
