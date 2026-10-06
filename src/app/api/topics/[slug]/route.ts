import { readPulse } from "@/lib/server/read";
import { json } from "@/lib/server/api";
import { slugSchema } from "@/lib/domain/schema";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugSchema.safeParse(slug).success) return json({ error: "Invalid slug" }, 400);
  const pulse = await readPulse();
  if (pulse.status === "unavailable") return json({ error: "Live data unavailable" }, 503);
  const topic = pulse.trends.find((t) => t.slug === slug);
  return topic ? json({ mode: pulse.mode, generatedAt: pulse.generatedAt, stale: pulse.stale, topic }) : json({ error: "Topic not found or no longer active" }, 404);
}
