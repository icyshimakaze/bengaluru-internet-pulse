import { describe, expect, it } from "vitest";
import { testRepository } from "./database";
import { now, observation, pulse, topic } from "./helpers";
import { loadMigrations, migrate } from "@/lib/db/schema";
import { fromSignal, itemInsert, snapshotInsert, topicInsert } from "@/lib/db/mapping";
import { legacyLifecycle, topicRecordSchema } from "@/lib/db/records";
import { evaluateTopics, HOUR } from "@/lib/trends/engine";
import { topicSnapshot } from "@/lib/trends/snapshots";

describe("versioned scoring persistence", () => {
  it("preserves v4 evidence, checksums and historical scores while publishing v2 at the same capture time", async () => {
    const repo = testRepository();
    await migrate(repo.client, loadMigrations().slice(0, 4), now);
    const evidence = [observation("version-a", 0.25), observation("version-b", 1, "gdelt")];
    const record = topicRecordSchema.parse({ id: "version-topic", slug: topic.slug, canonicalLabel: topic.title,
      category: topic.category, neighborhood: null, firstSeenAt: evidence[1]!.publishedAt, lastSeenAt: evidence[0]!.publishedAt,
      lifecycle: "RISING", pulseScore: 83, confidence: 0.81, summary: topic.description, enrichmentMethod: "rules", isFixture: false });
    const items = evidence.map((o) => fromSignal(o, { topicId: record.id, category: record.category, localRelevance: 1, enrichmentStatus: "completed" }));
    const original = { ...topicSnapshot(record.id, evidence, now), algorithmVersion: "v1" as const,
      pulseScore: 83, confidence: 0.81, velocityScore: 0.72, lifecycle: "RISING" as const };
    await repo.client.batch([topicInsert(record, { legacy: true }), ...items.map(itemInsert), snapshotInsert(original, { legacy: true })], "write");
    const ledger = (await repo.client.execute("SELECT * FROM schema_migrations ORDER BY version")).rows;
    const before = (await repo.client.execute("SELECT * FROM topic_snapshots")).rows[0]!;
    expect(await repo.initialize()).toEqual({ applied: [5, 6, 7], version: 7 });
    expect((await repo.client.execute("SELECT * FROM schema_migrations WHERE version<=4 ORDER BY version")).rows).toEqual(ledger);
    const after = (await repo.client.execute("SELECT * FROM topic_snapshots")).rows[0]!;
    for (const key of Object.keys(before)) expect(after[key]).toEqual(before[key]);
    expect((await repo.load(now)).items).toEqual([...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)));
    expect((await repo.fetchTopicHistory(record.id))[0]).toMatchObject({ algorithmVersion: "v1", pulseScore: 83, confidence: 0.81, growthRatio: undefined });

    const owner = (await repo.acquireLease(now))!;
    const published = await repo.publish([topic], [], pulse(), owner, now);
    const history = await repo.fetchTopicHistory(record.id);
    expect(history.map((h) => h.algorithmVersion)).toEqual(["v1", "v2"]);
    expect(history[0]).toMatchObject({ pulseScore: 83, velocityScore: 0.72, confidence: 0.81 });
    expect(history[1]).toMatchObject({ capturedAt: now.toISOString(), count2h: 2, previousCount2h: 0, count6h: 2,
      count24h: 2, sourceCount: 2, pulseScore: published.pulse.trends[0]!.score, growthRatio: 3, lifecycle: "EMERGING" });
    await repo.publish([topic], [], pulse(), owner, now);
    expect(await repo.fetchTopicHistory(record.id)).toHaveLength(2);
    expect((await repo.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    // The recreated capture guard still rejects a history row attached to another time.
    await expect(repo.saveSnapshots([{ ...history[1]!, capturedAt: new Date(now.getTime() + HOUR).toISOString() }])).rejects.toThrow();
  });

  it("upgrades legacy dashboard reads without changing collection timestamps or stored history", async () => {
    const repo = testRepository(); await repo.initialize();
    const evidence = [observation("cache-a", 0.25), observation("cache-b", 1, "gdelt")];
    const metric = evaluateTopics([topic], evidence, now)[0]!;
    const cached = { ...pulse({ trends: [metric], hotspots: [], totalSignals: 2 }), version: "v1",
      trends: [{ ...metric, lifecycle: legacyLifecycle(metric.lifecycle), score: 83 }] };
    const text = JSON.stringify(cached);
    await repo.client.execute({ sql: "INSERT INTO pulse_snapshots(id,captured_at,mode,payload) VALUES (?,?,?,?)", args: ["legacy-cache", now.toISOString(), "live", text] });
    const upgraded = await repo.latest();
    expect(upgraded).toMatchObject({ version: "v2", generatedAt: now.toISOString(), evaluatedAt: now.toISOString(), totalSignals: 2 });
    expect(upgraded?.trends[0]).toMatchObject({ current2h: 2, previous2h: 0, sourceCount: 2, score: metric.score });
    expect(upgraded?.notice).toContain("v2");
    expect((await repo.client.execute("SELECT payload FROM pulse_snapshots")).rows[0]?.payload).toBe(text);
    expect((await repo.client.execute("SELECT * FROM topic_snapshots")).rows).toEqual([]);
  });

  it("snapshots isolated and expired topics even when public ranking is empty", async () => {
    const repo = testRepository(); await repo.initialize();
    const owner = (await repo.acquireLease(now))!;
    const isolated = await repo.publish([topic], [observation("isolated", 0.25)], pulse(), owner, now);
    expect(isolated.pulse.trends).toEqual([]);
    const record = (await repo.findTopicBySlug(topic.slug))!;
    expect(record.lifecycle).toBe("NEW");
    expect((await repo.fetchTopicHistory(record.id))[0]).toMatchObject({ count2h: 1, sourceCount: 1, lifecycle: "NEW", scoreCap: 20 });
    await repo.releaseLease(owner);
    const later = new Date(now.getTime() + 3 * HOUR), capture = later.toISOString();
    const nextOwner = (await repo.acquireLease(later))!;
    const cooled = await repo.publish([], [], pulse({ generatedAt: capture, evaluatedAt: capture }), nextOwner, later);
    expect(cooled.pulse.trends).toEqual([]);
    expect((await repo.findTopicBySlug(topic.slug))?.lifecycle).toBe("inactive");
    expect((await repo.fetchTopicHistory(record.id))[1]).toMatchObject({ capturedAt: capture, count2h: 0,
      previousCount2h: 1, count6h: 1, count24h: 1, sourceCount: 0, pulseScore: 0, confidence: 0, lifecycle: "COOLING" });
    expect((await repo.latest())?.generatedAt).toBe(capture);
    await repo.releaseLease(nextOwner);
    const prunedAt = new Date(now.getTime() + 15 * 24 * HOUR), prunedCapture = prunedAt.toISOString();
    const prunedOwner = (await repo.acquireLease(prunedAt))!;
    await repo.publish([], [], pulse({ generatedAt: prunedCapture, evaluatedAt: prunedCapture }), prunedOwner, prunedAt);
    expect((await repo.fetchTopicHistory(record.id))[2]).toMatchObject({ count24h: 0, pulseScore: 0, lifecycle: "COOLING", firstSeenAt: record.firstSeenAt });
    expect((await repo.load(prunedAt)).items).toEqual([]);
    await repo.releaseLease(prunedOwner);
    const again = new Date(prunedAt.getTime() + HOUR), againOwner = (await repo.acquireLease(again))!;
    await repo.publish([], [], pulse({ generatedAt: again.toISOString(), evaluatedAt: again.toISOString() }), againOwner, again);
    expect(await repo.fetchTopicHistory(record.id)).toHaveLength(3);
  });

  it("rejects malformed scoring telemetry before changing persisted history", async () => {
    const repo = testRepository(); await repo.initialize();
    const owner = (await repo.acquireLease(now))!;
    await repo.publish([topic], [observation("validated", 0.25)], pulse(), owner, now);
    const record = (await repo.findTopicBySlug(topic.slug))!;
    const history = await repo.fetchTopicHistory(record.id), snapshot = history[0]!;
    for (const invalid of [{ ...snapshot, growthRatio: 0 }, { ...snapshot, clusterConsistency: 2 },
      { ...snapshot, scoreCap: 0, pulseScore: 100 }, { ...snapshot, changePercent: 301 }, { ...snapshot, sourceBalance: undefined }]) {
      await expect(repo.saveSnapshots([invalid])).rejects.toThrow();
    }
    expect(await repo.fetchTopicHistory(record.id)).toEqual(history);
  });
});
