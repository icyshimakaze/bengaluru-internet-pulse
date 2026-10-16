import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getEnv } from "@/lib/server/env";

let client: Client | undefined;
export const DATABASE_REQUEST_TIMEOUT_MS = 8000;
export const databaseFetch: typeof fetch = (input, init) => {
  const parent = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = AbortSignal.any([AbortSignal.timeout(DATABASE_REQUEST_TIMEOUT_MS), ...(parent ? [parent] : [])]);
  return fetch(input, { ...init, redirect: "error", cache: "no-store", signal });
};
export function getDatabase(): Client {
  if (client) return client;
  const env = getEnv();
  if (!env.TURSO_DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (env.TURSO_DATABASE_URL.startsWith("file:")) mkdirSync(dirname(resolve(env.TURSO_DATABASE_URL.slice(5))), { recursive: true });
  client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN,
    ...(env.TURSO_DATABASE_URL.startsWith("file:") ? {} : { fetch: databaseFetch }) });
  return client;
}
