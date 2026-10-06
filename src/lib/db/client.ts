import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getEnv } from "@/lib/server/env";

let client: Client | undefined;
export function getDatabase(): Client {
  if (client) return client;
  const env = getEnv();
  if (!env.TURSO_DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (env.TURSO_DATABASE_URL.startsWith("file:")) mkdirSync(dirname(resolve(env.TURSO_DATABASE_URL.slice(5))), { recursive: true });
  client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  return client;
}
