import "server-only";
import { FIXTURE_NOW, demoDataset, demoPulse } from "@/fixtures/demo";
import { type Repository, type PublishOptions } from "./repository";
import { fromSignal } from "./mapping";
import { type TopicRecord } from "./records";

export async function seedFixtures(repository: Repository, now = FIXTURE_NOW) {
  await repository.initialize();
  const owner = await repository.acquireLease(now);
  if (!owner) throw new Error("Seed database is busy");
  try {
    const dataset = demoDataset(now), pulse = demoPulse(now);
    const records: TopicRecord[] = dataset.topics.map((t) => {
      const times = dataset.observations.filter((o) => o.topicSlug === t.slug).map((o) => o.publishedAt).sort();
      return { id: "fixture-" + t.slug, slug: t.slug, canonicalLabel: t.title, category: t.category, neighborhood: null,
        firstSeenAt: times[0]!, lastSeenAt: times.at(-1)!, lifecycle: "inactive", pulseScore: 0, confidence: 0,
        summary: t.description, enrichmentMethod: t.method, isFixture: true };
    });
    const runs: NonNullable<PublishOptions["runs"]> = [];
    for (const health of pulse.sources) {
      const run = await repository.startIngestionRun(health.source, now, true);
      runs.push({ id: run.id, health });
    }
    const items = dataset.observations.map((o) => {
      const record = records.find((t) => t.slug === o.topicSlug)!;
      return fromSignal({ ...o, id: "fixture-" + o.id }, { topicId: record.id, category: record.category, neighborhood: o.neighborhood,
        localRelevance: 1, enrichmentStatus: "completed", ingestionRunId: runs.find((r) => r.health.source === o.source)!.id, isFixture: true });
    });
    return await repository.publish(dataset.topics, dataset.observations, pulse, owner, now, { items, topicRecords: records, runs });
  } finally { await repository.releaseLease(owner); }
}
