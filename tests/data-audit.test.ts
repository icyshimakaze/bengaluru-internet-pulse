import { describe, expect, it } from "vitest";
import { testRepository } from "./database";
import { now, observation, topic, pulse } from "./helpers";
import { auditStoredData } from "@/lib/pipeline/data-audit";
import { fromSignal } from "@/lib/db/mapping";
import { previewCategoryRepairs, applyCategoryRepairs } from "@/lib/pipeline/repair-categories";
import { classifyAI } from "@/lib/pipeline/ai";
import { repairStoredTopics } from "@/lib/pipeline/repair-topics";

describe("stored live data audit and bounded category repair", () => {
  it("reports empty storage honestly without counting demo rows or writing data", async () => {
    const repo = testRepository(); await repo.initialize();
    await repo.insertItem(fromSignal(observation("fixture", 1), { isFixture: true }));
    const before = await repo.client.execute("SELECT count(*) AS count FROM items");
    expect(await auditStoredData(repo.client, now)).toMatchObject({ itemCount: 0, inspectedItems: 0, staleSnapshot: true, latestSnapshot: null });
    expect(await repo.client.execute("SELECT count(*) AS count FROM items")).toEqual(before);
  });
  it("finds malformed timestamps independently, flags future dates, and separates retained older evidence", async () => {
    const repo = testRepository(); await repo.initialize();
    await repo.insertItem(fromSignal(observation("old", 25)));
    await repo.insertItem(fromSignal(observation("future", -1)));
    await repo.insertItem(fromSignal(observation("invalid", 1)));
    await repo.client.execute({ sql: "UPDATE items SET published_at=? WHERE source_id=?", args: ["0000-not-a-date", "invalid"] });
    const audit = await auditStoredData(repo.client, now);
    expect(audit.invalidRecords).toHaveLength(1); expect(audit.futureTimestamps).toHaveLength(1);
    expect(audit.outside24h).toBe(1); expect(audit.inspectedItems).toBe(3);
  });
  it("repairs reproduced address leakage atomically, keeps identity and history, and leaves mock provenance untouched", async () => {
    const repo = testRepository(); await repo.initialize();
    const text = "Bengaluru KOKO Curated Menu Food event 📍 Old Airport Road, Bangalore";
    const signal = { ...observation("menu", 1), title: text, excerpt: text, text };
    await repo.insertItem(fromSignal(signal));
    const assignments = [...(await classifyAI([signal], [], { provider: "heuristic" })).values()];
    const assignment = assignments[0]!, target = assignment.topic!;
    const record = { id: target.id, slug: target.slug, canonicalLabel: target.canonical_label, category: "City life" as const, neighborhood: null, firstSeenAt: signal.publishedAt, lastSeenAt: signal.publishedAt, lifecycle: "inactive" as const, pulseScore: 0, confidence: 0, summary: assignment.result.summary, enrichmentMethod: "rules" as const, isFixture: false };
    const owner = (await repo.acquireLease(now))!;
    await repo.publish([{ ...topic, slug: target.slug, title: target.canonical_label, category: "City life" }], [], pulse({ generatedAt: now.toISOString(), trends: [] }), owner, now, { topicRecords: [record], enrichments: assignments });
    // Reproduce the historic classifier's address-driven category in every current record.
    const bad = { ...assignment.result, category: "traffic", new_topic: { ...assignment.result.new_topic!, category: "traffic" } };
    await repo.client.execute({ sql: "UPDATE items SET category='Mobility' WHERE id=?", args: [signal.id] });
    await repo.client.execute({ sql: "UPDATE topics SET category='Mobility' WHERE id=?", args: [target.id] });
    await repo.client.execute({ sql: "UPDATE item_enrichments SET payload=? WHERE item_id=?", args: [JSON.stringify(bad), signal.id] });
    const snapshot = await repo.latest();
    expect(await previewCategoryRepairs(repo.client)).toEqual([{ itemId: signal.id, topicId: target.id, from: "Mobility", to: "City life", semantic: "food" }]);
    expect(await applyCategoryRepairs(repo.client, owner, now)).toHaveLength(1);
    expect(await previewCategoryRepairs(repo.client)).toEqual([]);
    expect((await repo.load(now)).items[0]).toMatchObject({ topicId: target.id, category: "City life", enrichmentProvider: "heuristic", publishedAt: signal.publishedAt });
    expect((await repo.enrichment.find(signal.id))?.result.category).toBe("food");
    expect(await repo.latest()).toEqual(snapshot);
    await repo.client.execute("UPDATE item_enrichments SET provider='mock',model=NULL");
    await repo.client.execute("UPDATE items SET category='Mobility',enrichment_provider='mock'");
    expect(await previewCategoryRepairs(repo.client)).toEqual([]);
    await repo.releaseLease(owner);
  });
  it("repairs a terminal irrelevant paraphrase using retained local event evidence and keeps original timestamps", async () => {
    const repo = testRepository(); await repo.initialize();
    const titles = ["MIT Bengaluru Inaugurates Quantum-Hub@MAHE", "Manipal Institute of Technology unveils Quantum-Hub@MAHE, a 25-qubit facility"];
    const signals = titles.map((title, i) => ({ ...observation(`quantum-${i}`, 1), title, excerpt: title, text: title }));
    for (const signal of signals) await repo.insertItem(fromSignal(signal));
    const assignments = [...(await classifyAI(signals, [], { provider: "heuristic" })).values()];
    const target = assignments[0]!.topic!;
    const owner = (await repo.acquireLease(now))!;
    await repo.publish([{ ...topic, slug: target.slug, title: target.canonical_label }], [], pulse({ generatedAt: now.toISOString(), trends: [] }), owner, now, {
      topicRecords: [{ id: target.id, slug: target.slug, canonicalLabel: target.canonical_label, category: "Technology", neighborhood: null, firstSeenAt: signals[0]!.publishedAt, lastSeenAt: signals[0]!.publishedAt, lifecycle: "inactive", pulseScore: 0, confidence: 0, summary: assignments[0]!.result.summary, enrichmentMethod: "rules", isFixture: false }], enrichments: assignments,
    });
    const snapshot = await repo.latest();
    await repo.client.execute({ sql: "UPDATE items SET enrichment_status='irrelevant',topic_id=NULL,category=NULL,local_relevance=0 WHERE id=?", args: [signals[1]!.id] });
    expect(await repairStoredTopics(repo.client, { now })).toHaveLength(1);
    expect(await repairStoredTopics(repo.client, { apply: true, owner, now })).toHaveLength(1);
    expect(await repairStoredTopics(repo.client, { now })).toEqual([]);
    const data = await repo.load(now);
    expect(data.items.every((item) => item.topicId === target.id && item.enrichmentStatus === "completed")).toBe(true);
    expect(data.items.map((item) => item.publishedAt)).toEqual(signals.map((signal) => signal.publishedAt));
    expect(await repo.latest()).toEqual(snapshot);
    await repo.releaseLease(owner);
  });
});
