import { readPulse } from "@/lib/server/read";
import { json } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET() { const p = await readPulse(); return json({ status: p.status, mode: p.mode, version: p.version, generatedAt: p.generatedAt, stale: p.stale, sources: p.sources, enrichment: p.enrichment }, p.status === "unavailable" || p.stale ? 503 : 200); }
