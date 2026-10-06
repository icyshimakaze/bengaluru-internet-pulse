import { type Observation, type Source, type Topic, type Pulse } from "@/lib/domain/schema";
import { normalize } from "@/lib/pipeline/normalize";
import { HOUR } from "@/lib/trends/engine";
import { FIXTURE_NOW, demoPulse } from "@/fixtures/demo";
export const now = FIXTURE_NOW;
export const topic: Topic = { slug: "test-topic", title: "Test topic", category: "Technology", description: "Observed discussion", method: "rules" };
export function observation(id: string, ageHours: number, source: Source = "bluesky", slug = topic.slug): Observation {
  const signal = normalize({ source, sourceId: id, url: `https://example.org/items/${id}`, title: `Bengaluru test discussion ${id}`, publishedAt: new Date(now.getTime() - ageHours * HOUR).toISOString() }, ageHours < 0 ? new Date(now.getTime() + HOUR) : now);
  if (!signal) throw new Error("Invalid test fixture");
  return { ...signal, topicSlug: slug, neighborhood: null };
}
export function pulse(overrides: Partial<Pulse> = {}): Pulse { return { ...demoPulse(now), mode: "live", status: "healthy", sources: demoPulse(now).sources.map((s) => ({ ...s, status: "ok" })), ...overrides }; }
