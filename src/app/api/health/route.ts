import { readHealth } from "@/lib/server/queries";
import { json, parseParameters, emptyQuerySchema, invalidQuery } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET(request?: Request) {
  if (!parseParameters(request, emptyQuerySchema).success) return invalidQuery();
  const data = await readHealth();
  return json(data, ["unavailable", "degraded"].includes(data.status) || data.stale ? 503 : 200);
}
