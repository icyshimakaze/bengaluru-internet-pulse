import { getEnv } from "@/lib/server/env";
import { authorized } from "@/lib/server/auth";
import { ingest } from "@/lib/pipeline/ingest";
import { json } from "@/lib/server/api";
import { log } from "@/lib/server/logger";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const env = getEnv();
    if (!authorized(request.headers.get("authorization"), env.CRON_SECRET)) return json({ error: "Unauthorized" }, 401);
    if (env.APP_DATA_MODE !== "live") return json({ error: "Ingestion requires live mode" }, 409);
    const result = await ingest();
    return json({ skipped: result.skipped, added: result.added, status: result.pulse?.status ?? "busy", generatedAt: result.pulse?.generatedAt ?? null }, result.skipped ? 409 : result.pulse?.status === "unavailable" ? 503 : 200);
  } catch { log("error", "ingest.failed", { code: "INGEST_FAILED" }); return json({ error: "Ingestion failed" }, 503); }
}
