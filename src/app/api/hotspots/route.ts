import { readPulse } from "@/lib/server/read";
import { json } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET() { const p = await readPulse(); return json({ mode: p.mode, generatedAt: p.generatedAt, stale: p.stale, hotspots: p.hotspots, locationBasis: "Neighborhood mentions, not verified incident coordinates" }, p.status === "unavailable" ? 503 : 200); }
