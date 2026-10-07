import { readTopics } from "@/lib/server/queries";
import { json, querySchema, parseParameters, invalidQuery } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const result = parseParameters(request, querySchema);
  if (!result.success) return invalidQuery();
  const data = await readTopics(result.data);
  return json(data, data.status === "unavailable" ? 503 : 200);
}
