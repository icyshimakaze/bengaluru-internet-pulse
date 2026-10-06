import { readPulse } from "@/lib/server/read";
import { json, querySchema } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const result = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!result.success) return json({ error: "Invalid topic filters", issues: result.error.flatten() }, 400);
  const pulse = await readPulse();
  const { q, category, source, lifecycle, limit } = result.data;
  const topics = pulse.trends.filter((t) => (!q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase())) && (!category || t.category === category) && (!source || t.sources.includes(source)) && (!lifecycle || t.lifecycle === lifecycle));
  return json({ mode: pulse.mode, generatedAt: pulse.generatedAt, stale: pulse.stale, total: topics.length, topics: topics.slice(0, limit) }, pulse.status === "unavailable" ? 503 : 200);
}
