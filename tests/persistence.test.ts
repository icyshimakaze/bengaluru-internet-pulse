import { describe, expect, it } from "vitest";
import { testRepository } from "./database";
import { now, observation, topic, pulse } from "./helpers";
import { fromSignal } from "@/lib/db/mapping";
import { DAY } from "@/lib/db/data-repository";
import { topicSnapshot } from "@/lib/trends/snapshots";
import { seedFixtures } from "@/lib/db/seed";
import { evaluateTopics, HOUR } from "@/lib/trends/engine";
import type { ItemRecord } from "@/lib/db/records";

const at = (days: number) => new Date(now.getTime() - days * DAY);
async function setup() {
  const repo = testRepository(); await repo.initialize();
  const record = await repo.createTopic({ id: "topic-1", slug: topic.slug, canonicalLabel: topic.title, category: topic.category,
    firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), summary: topic.description });
  return { repo, record };
}
describe("typed relational repositories", () => {
  it("inserts pending evidence and reports every supported duplicate identity", async () => {
    const { repo } = await setup();
    const item = fromSignal(observation("original", 1));
    expect((await repo.insertItem(item)).inserted).toBe(true);
    expect((await repo.insertItem(item)).duplicate?.reasons).toEqual(["id", "source_identity", "canonical_url", "content_fingerprint"]);
    const variant = fromSignal(observation("variant", 1, "gdelt"));
    for (const [field, reason] of [["canonicalUrl", "canonical_url"], ["contentFingerprint", "content_fingerprint"], ["sourceId", "source_identity"]] as const) {
      const candidate = { ...variant, source: item.source, [field]: item[field] };
      expect((await repo.detectDuplicates(candidate))[0]?.reasons).toContain(reason);
      expect((await repo.insertItem(candidate)).inserted).toBe(false);
    }
    expect(await repo.findRecentItems({ since: at(1), until: now })).toHaveLength(1);
  });
  it("assigns items, synchronizes observation timestamps and topic metadata", async () => {
    const { repo, record } = await setup();
    const item = fromSignal(observation("assign", 2));
    await repo.insertItem(item);
    expect(await repo.assignItemToTopic("absent", record.id)).toBeNull();
    await expect(repo.assignItemToTopic(item.id, "absent")).rejects.toThrow("Topic not found");
    const assigned = await repo.assignItemToTopic(item.id, record.id, { neighborhood: "Whitefield", localRelevance: 0.8 });
    expect(assigned).toMatchObject({ topicId: record.id, category: "Technology", enrichmentStatus: "completed", localRelevance: 0.8 });
    expect((await repo.findTopicBySlug(topic.slug))?.firstSeenAt).toBe(item.publishedAt);
    const summary = "A literal quote '); DROP TABLE items; --";
    await repo.updateTopic(record.id, { category: "Mobility", summary });
    expect((await repo.findRecentItems({ since: at(1), until: now, topicId: record.id }))[0]?.category).toBe("Mobility");
    expect((await repo.findTopicBySlug(topic.slug))?.summary).toBe(summary);
    await expect(repo.updateTopic(record.id, {})).rejects.toThrow();
    await expect(repo.updateTopic(record.id, { lastSeenAt: at(2).toISOString() })).rejects.toThrow();
  });
  it("validates records and enforces topic/run foreign keys and dataset ownership", async () => {
    const { repo, record } = await setup();
    const item = fromSignal(observation("guards", 1));
    await expect(repo.insertItem({ ...item, domain: "wrong.example" })).rejects.toThrow();
    await expect(repo.insertItem({ ...item, topicId: "missing" })).rejects.toThrow();
    await expect(repo.insertItem({ ...item, topicId: record.id, isFixture: true })).rejects.toThrow();
    await expect(repo.insertItem({ ...item, ingestionRunId: "missing" })).rejects.toThrow();
    const run = await repo.startIngestionRun("gdelt", now);
    await expect(repo.insertItem({ ...item, ingestionRunId: run.id })).rejects.toThrow();
    await repo.insertItem(item);
    const fixture = await repo.createTopic({ id: "fixture-topic", slug: topic.slug, canonicalLabel: topic.title, category: topic.category,
      firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), summary: topic.description, isFixture: true });
    await expect(repo.assignItemToTopic(item.id, fixture.id)).rejects.toThrow("across datasets");
    await expect(repo.client.execute({ sql: "DELETE FROM topics WHERE id=?", args: [record.id] })).resolves.toBeDefined();
    await expect(repo.saveSnapshots([topicSnapshot("missing", [], now)])).rejects.toThrow();
  });
  it("filters recent items and aggregates explicit neighborhood activity", async () => {
    const { repo, record } = await setup();
    for (const [index, age] of [0.5, 1, 4, -0.5].entries()) {
      const item = fromSignal(observation("filter-" + index, age, index % 2 ? "gdelt" : "bluesky"));
      await repo.insertItem({ ...item, topicId: record.id, category: record.category, neighborhood: "Whitefield", localRelevance: 1, enrichmentStatus: "completed" });
    }
    expect(await repo.findRecentItems({ since: at(1), until: now })).toHaveLength(3);
    expect(await repo.findRecentItems({ since: at(1), until: now, source: "gdelt", limit: 1 })).toHaveLength(1);
    expect(await repo.fetchHotspotActivity({ since: new Date(now.getTime() - 3 * HOUR), until: now })).toEqual([
      { neighborhood: "Whitefield", lat: 12.9698, lng: 77.75, count: 2, topics: [topic.slug] },
    ]);
    await expect(repo.findRecentItems({ since: now, until: at(1) })).rejects.toThrow();
  });
  it("records exact 2h/previous 2h/6h/24h boundaries and upserts ordered history", async () => {
    const { repo, record } = await setup();
    const evidence = [0, 2, 3, 4, 6, 24, 24.01, -0.1].map((age, i) => observation("window-" + i, age));
    const trend = evaluateTopics([topic], evidence, now)[0]!;
    const snapshot = topicSnapshot(record.id, evidence, now, trend);
    expect(snapshot).toMatchObject({ count2h: 1, previousCount2h: 2, count6h: 4, count24h: 6, sourceCount: 1, count3h: 2, previousCount3h: 2, pulseScore: trend.score });
    const older = topicSnapshot(record.id, evidence.map((o) => ({ ...o, publishedAt: new Date(Date.parse(o.publishedAt) - DAY).toISOString(), collectedAt: new Date(Date.parse(o.collectedAt) - DAY).toISOString() })), at(1));
    await repo.saveSnapshots([snapshot, older]);
    await repo.saveSnapshots([{ ...snapshot, pulseScore: 19 }]);
    const history = await repo.fetchTopicHistory(record.id);
    expect(history).toHaveLength(2);
    expect(history.map((s) => s.capturedAt)).toEqual([at(1).toISOString(), now.toISOString()]);
    expect(history[1]?.pulseScore).toBe(19);
    expect(await repo.fetchTopicHistory(record.id, { since: now, until: now, limit: 1 })).toHaveLength(1);
  });
  it("tracks terminal ingestion counters and recovers interrupted runs", async () => {
    const { repo } = await setup();
    const run = await repo.startIngestionRun("bluesky", at(1));
    expect(await repo.ingestionStatus({ onlyRunning: true })).toHaveLength(1);
    expect(await repo.recoverInterruptedRuns(now)).toBe(1);
    expect((await repo.ingestionStatus())[0]).toMatchObject({ status: "abandoned", errors: 1, errorMessage: "RUN_INTERRUPTED" });
    const next = await repo.startIngestionRun("gdelt", now);
    const completed = await repo.completeIngestionRun(next.id, { finishedAt: now.toISOString(), discovered: 5, inserted: 2, duplicates: 1, errors: 2, status: "partial", errorMessage: "VALIDATION_REJECTED" });
    expect(completed).toMatchObject({ inserted: 2, errors: 2, status: "partial" });
    expect(await repo.completeIngestionRun(next.id, { finishedAt: null, discovered: 0, inserted: 0, duplicates: 0, errors: 0, status: "running", errorMessage: null })).toEqual(completed);
    expect(await repo.ingestionStatus({ source: "gdelt" })).toHaveLength(1);
    expect(await repo.completeIngestionRun("absent", { finishedAt: now.toISOString(), discovered: 0, inserted: 0, duplicates: 0, errors: 0, status: "failed", errorMessage: null })).toBeNull();
    expect((await repo.ingestionStatus()).some((r) => r.id === run.id)).toBe(true);
  });
  it("prunes 14-day items and 30-day history while retaining exact boundaries and referenced topics", async () => {
    const { repo, record } = await setup();
    const item = fromSignal(observation("retention", 1));
    const make = (id: string, date: Date): ItemRecord => ({ ...item, id, sourceId: id, canonicalUrl: "https://example.org/" + id,
      contentFingerprint: id, publishedAt: date.toISOString(), topicId: record.id, category: record.category, localRelevance: 1, enrichmentStatus: "completed" });
    await repo.insertItem(make("boundary", at(14)));
    await repo.insertItem(make("expired", new Date(at(14).getTime() - 1)));
    await repo.saveSnapshots([topicSnapshot(record.id, [], at(30)), topicSnapshot(record.id, [], new Date(at(30).getTime() - 1))]);
    expect(await repo.pruneOldData(now)).toMatchObject({ items: 1, snapshots: 1, topics: 0 });
    expect(await repo.findRecentItems({ since: at(15), until: now })).toHaveLength(1);
    expect(await repo.fetchTopicHistory(record.id)).toHaveLength(1);
    await repo.updateTopic(record.id, { lastSeenAt: at(31).toISOString(), firstSeenAt: at(32).toISOString() });
    expect((await repo.pruneOldData(now)).topics).toBe(0);
    expect((await repo.pruneOldData(new Date(now.getTime() + 31 * DAY))).topics).toBe(1);
    expect(await repo.findTopicBySlug(topic.slug)).toBeNull();
    expect((await repo.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
  it("publishes only persisted distinct items and rolls back invalid batches", async () => {
    const { repo, record } = await setup();
    const a = observation("pub-a", 0.5), b = observation("pub-b", 1);
    const owner = (await repo.acquireLease(now))!;
    const duplicate = { ...b, canonicalUrl: a.canonicalUrl };
    const result = await repo.publish([topic], [a, duplicate], pulse(), owner, now);
    expect(result.inserted).toBe(1);
    expect(result.pulse.trends).toHaveLength(0);
    expect(await repo.listActiveTopics({ now })).toHaveLength(0);
    await repo.publish([topic], [a, b], pulse(), owner, now);
    expect(await repo.listActiveTopics({ now })).toHaveLength(1);
    expect((await repo.fetchTopicHistory(record.id))[0]?.count24h).toBe(2);
    await expect(repo.publish([topic], [], pulse(), owner, now, { items: [
      fromSignal(observation("rollback-good", 1)), { ...fromSignal(observation("rollback-bad", 1)), topicId: "absent" },
    ] })).rejects.toThrow();
    expect(await repo.findRecentItems({ since: at(1), until: now })).toHaveLength(2);
    expect((await repo.latest())?.totalSignals).toBe(2);
  });
  it("seeds idempotent fixtures excluded from all default live reads", async () => {
    const repo = testRepository();
    const first = await seedFixtures(repo, now), second = await seedFixtures(repo, now);
    expect(first.inserted).toBe(221); expect(second.inserted).toBe(0);
    expect(await repo.latest()).toBeNull();
    expect((await repo.latest("demo"))?.trends).toHaveLength(6);
    expect((await repo.load(now)).items).toHaveLength(0);
    const seeded = await repo.load(now, true);
    expect(seeded.items).toHaveLength(221);
    expect(await repo.listActiveTopics({ now })).toHaveLength(0);
    expect(await repo.listActiveTopics({ now, isFixture: true })).toHaveLength(6);
    expect(await repo.fetchHotspotActivity({ since: at(1), until: now })).toEqual([]);
    expect(await repo.ingestionStatus()).toEqual([]);
    expect(await repo.ingestionStatus({ isFixture: true })).toHaveLength(6);
    expect(await repo.fetchTopicHistory(seeded.topicRecords[0]!.id)).toHaveLength(1);
  });
});
