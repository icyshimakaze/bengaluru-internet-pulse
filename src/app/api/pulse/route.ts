import { readPulse } from "@/lib/server/read";
import { json } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET() { const pulse = await readPulse(); return json(pulse, pulse.status === "unavailable" ? 503 : 200); }
