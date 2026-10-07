import { readHotspots } from "@/lib/server/queries";
import { readQuerySchema } from "@/lib/domain/read-models";
import { json, parseParameters, invalidQuery } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET(request?: Request) {
  const query = parseParameters(request, readQuerySchema);
  if (!query.success) return invalidQuery();
  const data = await readHotspots(query.data);
  return json(data, data.status === "unavailable" ? 503 : 200);
}
