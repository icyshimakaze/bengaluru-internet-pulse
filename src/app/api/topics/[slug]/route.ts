import { readTopic, ReadUnavailableError } from "@/lib/server/queries";
import { json, parseParameters, emptyQuerySchema, invalidQuery } from "@/lib/server/api";
import { slugSchema } from "@/lib/domain/schema";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slugSchema.safeParse(slug).success) return json({ error: "Invalid slug", code: "INVALID_SLUG" }, 400);
  if (!parseParameters(request, emptyQuerySchema).success) return invalidQuery();
  try {
    const topic = await readTopic(slug);
    return topic ? json(topic) : json({ error: "Topic not found", code: "NOT_FOUND" }, 404);
  } catch (error) {
    return error instanceof ReadUnavailableError ? json({ error: "Live data unavailable", code: "READ_UNAVAILABLE" }, 503)
      : json({ error: "Unable to read topic", code: "INTERNAL_ERROR" }, 500);
  }
}
