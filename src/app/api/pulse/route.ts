import { readDashboard } from "@/lib/server/queries";
import { readQuerySchema } from "@/lib/domain/read-models";
import { json, parseParameters, invalidQuery } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET(request?: Request) {
  const query = parseParameters(request, readQuerySchema);
  if (!query.success) return invalidQuery();
  const pulse = await readDashboard(query.data);
  return json(pulse, pulse.status === "unavailable" ? 503 : 200);
}
