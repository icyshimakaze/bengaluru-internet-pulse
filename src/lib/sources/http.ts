import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { errorCode, log } from "@/lib/server/logger";
import { sourceSchema, type Source } from "@/lib/domain/schema";

export type TransportOptions = { timeoutMs?: number; signal?: AbortSignal; source?: Source; queryId?: string; minIntervalMs?: number };
type Options = TransportOptions & { attempts?: number; fetcher?: typeof fetch; init?: RequestInit };
export type Transport = (url: string, options?: TransportOptions) => Promise<unknown>;
export const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const settings = z.object({ timeoutMs: z.number().int().min(1).max(15000).default(8000), attempts: z.number().int().min(1).max(3).default(2),
  source: sourceSchema.optional(), queryId: z.string().max(80).optional(), minIntervalMs: z.number().int().min(0).max(10000).default(0) });
const nextRequestAt = new Map<string, number>();

// Also bounds injected transports and body streams that ignore cancellation.
export function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    work.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}
function retryDelay(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const seconds = Number(value);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(duration) ? Math.max(0, duration) : fallback;
}
export async function fetchJson(url: string, options: Options = {}): Promise<unknown> {
  const { timeoutMs, attempts, source, queryId, minIntervalMs } = settings.parse(options);
  const fetcher = options.fetcher ?? fetch, init = options.init ?? {};
  const parent = options.signal ?? init.signal;
  for (let attempt = 0; attempt < attempts; attempt++) {
    parent?.throwIfAborted();
    if (minIntervalMs) {
      const host = new URL(url).hostname;
      const scheduled = Math.max(Date.now(), nextRequestAt.get(host) ?? 0);
      nextRequestAt.set(host, scheduled + minIntervalMs);
      try { await delay(scheduled - Date.now(), undefined, { signal: parent ?? undefined }); }
      catch (error) { if (parent?.aborted) throw parent.reason; throw error; }
    }
    let backoff = 250 * 2 ** attempt;
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(parent ? [parent] : [])]);
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      const response = await withAbort(fetcher(url, { ...init, cache: "no-store", credentials: "omit", signal, headers }), signal);
      if (!response.ok) {
        backoff = retryDelay(response.headers.get("retry-after"), backoff);
        void response.body?.cancel().catch(() => {});
        throw new Error(`HTTP_${response.status}`);
      }
      if (Number(response.headers.get("content-length")) > RESPONSE_LIMIT_BYTES) {
        void response.body?.cancel().catch(() => {}); throw new Error("RESPONSE_TOO_LARGE");
      }
      if (!response.body) throw new Error("EMPTY_BODY");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let size = 0, body = "", finished = false;
      try {
        while (true) {
          const part = await withAbort(reader.read(), signal);
          if (part.done) { finished = true; break; }
          size += part.value.byteLength;
          if (size > RESPONSE_LIMIT_BYTES) throw new Error("RESPONSE_TOO_LARGE");
          body += decoder.decode(part.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        if (!finished) void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      return JSON.parse(body) as unknown;
    } catch (error) {
      if (parent?.aborted) throw parent.reason;
      const code = error instanceof Error ? error.message : "";
      const transient = error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) || /^HTTP_(408|429|5\d\d)$/.test(code);
      // Long Retry-After values stop this poll instead of retrying too early.
      if (!transient || attempt + 1 >= attempts || backoff > 5000) throw error;
      log("warn", "source.http_retry", { source: source ?? null, query: queryId ?? null, host: new URL(url).hostname,
        attempt: attempt + 1, code: errorCode(error), delayMs: backoff });
      try { await delay(backoff, undefined, { signal: parent ?? undefined }); }
      catch (failure) { if (parent?.aborted) throw parent.reason; throw failure; }
    }
  }
  throw new Error("RETRIES_EXHAUSTED");
}
