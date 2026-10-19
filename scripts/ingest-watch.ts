import "./env";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { runIngestionWatch, watchConfiguration, watchPolicy } from "../src/lib/ingestion/watch";
import { log } from "../src/lib/server/logger";

try {
  const config = watchConfiguration(process.env);
  const collect = () => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--conditions=react-server", "scripts/ingest.ts", "--require-remote"],
      { stdio: "inherit", timeout: watchPolicy.collectionTimeoutMs, killSignal: "SIGKILL" });
    child.once("error", () => reject(new Error("COLLECTION_PROCESS_FAILED")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("COLLECTION_PROCESS_FAILED")));
  });
  const isCurrent = async () => {
    if (!config.continuous) return true;
    try {
      const response = await fetch(`https://api.github.com/repos/${config.repository}/git/ref/heads/main`, {
        headers: { Authorization: `Bearer ${config.token}`, Accept: "application/vnd.github+json", "User-Agent": "BengaluruPulse-worker" },
        signal: AbortSignal.timeout(8000), cache: "no-store",
      });
      if (!response.ok) throw new Error();
      return z.object({ object: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u) }) }).parse(await response.json()).object.sha === config.sha;
    } catch {
      log("warn", "ingest.watch.head_check_failed", { code: "HEAD_CHECK_FAILED" });
      return true; // A temporary GitHub API outage must not stop collection; the five-hour bound still applies.
    }
  };
  log("info", "ingest.watch.started", { continuous: config.continuous, intervalMs: watchPolicy.intervalMs, durationMs: config.continuous ? watchPolicy.durationMs : 0 });
  await runIngestionWatch(config.continuous, { now: Date.now, sleep, collect, isCurrent,
    report: (event, fields) => log("info", event, fields) });
} catch {
  log("error", "ingest.watch.failed", { code: "WATCH_OR_COLLECTION_FAILED" });
  process.exitCode = 1;
}
