import { createClient } from "@libsql/client";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach } from "vitest";
import { Repository } from "@/lib/db/repository";

const databases: Array<{ client: ReturnType<typeof createClient>; directory: string }> = [];
export function testRepository(): Repository {
  // Interactive transactions open new connections; anonymous :memory: databases
  // cannot preserve state across those connections in the native libSQL SDK.
  mkdirSync(".cache", { recursive: true });
  const directory = mkdtempSync(join(process.cwd(), ".cache", "persistence-"));
  const client = createClient({ url: "file:" + join(directory, "test.db").replaceAll("\\", "/") });
  databases.push({ client, directory });
  return new Repository(client);
}
afterEach(() => {
  for (const { client, directory } of databases.splice(0)) {
    client.close();
    // The Windows SDK retains native transaction/file handles until GC. Deleting
    // an active database can race finalizers, report EBUSY/EPERM or crash a worker.
    // Leave only these isolated, ignored test directories for later cleanup.
    if (process.platform !== "win32") rmSync(directory, { recursive: true, force: true });
  }
});
