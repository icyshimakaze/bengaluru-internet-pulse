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
    try { rmSync(directory, { recursive: true, force: true }); }
    catch (error) {
      // Native transaction handles are released by GC on Windows; locked files
      // remain confined to ignored .cache rather than breaking test assertions.
      if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  }
});
