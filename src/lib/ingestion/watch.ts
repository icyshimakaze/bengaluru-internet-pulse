import "server-only";
import { z } from "zod";

export const watchPolicy = { intervalMs: 30 * 60_000, durationMs: 5 * 60 * 60_000, checkMs: 60_000, collectionTimeoutMs: 3 * 60_000 } as const;
export function watchConfiguration(env: Record<string, string | undefined>) {
  const continuous = z.enum(["true", "false"]).default("false").parse(env.INGEST_CONTINUOUS) === "true";
  if (!continuous) return { continuous: false as const };
  return { continuous: true as const, ...z.object({
    actions: z.literal("true"), visibility: z.literal("public"),
    repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/u),
    sha: z.string().regex(/^[a-f0-9]{40}$/u), token: z.string().min(1),
  }).parse({ actions: env.GITHUB_ACTIONS, visibility: env.REPOSITORY_VISIBILITY,
    repository: env.GITHUB_REPOSITORY, sha: env.GITHUB_SHA, token: env.GITHUB_TOKEN }) };
}

type Runtime = {
  now: () => number; sleep: (ms: number) => Promise<void>; collect: () => Promise<void>;
  isCurrent: () => Promise<boolean>;
  report: (event: string, fields: Record<string, string | number>) => void;
};
/** One collector at a time; wall-clock limits and iteration limits both apply. */
export async function runIngestionWatch(continuous: boolean, runtime: Runtime) {
  const deadline = runtime.now() + watchPolicy.durationMs;
  const maxPolls = continuous ? Math.floor(watchPolicy.durationMs / watchPolicy.intervalMs) + 1 : 1;
  for (let poll = 1; poll <= maxPolls && runtime.now() + watchPolicy.collectionTimeoutMs <= deadline; poll++) {
    if (continuous && !await runtime.isCurrent()) {
      runtime.report("ingest.watch.superseded", { polls: poll - 1 }); return;
    }
    if (runtime.now() + watchPolicy.collectionTimeoutMs > deadline) break;
    // A failed process fails the job visibly. No overlap or unbounded retry.
    await runtime.collect();
    if (!continuous) return;
    const nextAt = runtime.now() + watchPolicy.intervalMs;
    if (nextAt > deadline || poll === maxPolls) break;
    runtime.report("ingest.watch.waiting", { polls: poll, nextAt: new Date(nextAt).toISOString(), deadline: new Date(deadline).toISOString() });
    while (runtime.now() < nextAt) {
      await runtime.sleep(Math.min(watchPolicy.checkMs, nextAt - runtime.now()));
      // Hand off promptly after a release, without cancelling a publication.
      if (!await runtime.isCurrent()) {
        runtime.report("ingest.watch.superseded", { polls: poll }); return;
      }
    }
  }
  runtime.report("ingest.watch.completed", {});
}
