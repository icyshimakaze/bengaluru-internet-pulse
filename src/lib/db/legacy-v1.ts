import "server-only";
import type { Transaction, InStatement } from "@libsql/client";
import { topicSchema, observationSchema, pulseSchema, type Observation } from "@/lib/domain/schema";
import { topicInsert, itemInsert, fromSignal, snapshotInsert } from "./mapping";
import type { TopicRecord } from "./records";
import { topicSnapshot } from "@/lib/trends/snapshots";

// This adapter belongs to migration 0001. Keep its v1 input contracts stable.
export async function backfillLegacy(tx: Transaction, now: Date): Promise<void> {
  const rows = await tx.batch(["SELECT payload FROM legacy_topics", "SELECT payload FROM legacy_observations", "SELECT id,generated_at,payload FROM legacy_snapshots ORDER BY id"]);
  const observations = (rows[1]?.rows ?? []).map((r) => observationSchema.parse(JSON.parse(String(r.payload))));
  const uniquePulses = new Map<string, { id: string; pulse: ReturnType<typeof pulseSchema.parse> }>();
  for (const r of rows[2]?.rows ?? []) {
    const pulse = pulseSchema.parse(JSON.parse(String(r.payload)));
    if (!pulse.generatedAt) throw new Error("Legacy snapshot has no collection timestamp");
    // Old storage permitted repeated polls at exactly the same capture time.
    uniquePulses.set(pulse.mode + ":" + pulse.generatedAt, { id: "legacy-" + r.id, pulse });
  }
  const pulses = [...uniquePulses.values()].sort((a, b) => a.pulse.generatedAt!.localeCompare(b.pulse.generatedAt!));
  const catalog = new Map<string, TopicRecord>();
  const catalogKey = (slug: string, fixture: boolean) => Number(fixture) + ":" + slug;
  const addTopic = (input: unknown, evidence: Observation[], isFixture = false) => {
    const t = topicSchema.parse(input), key = catalogKey(t.slug, isFixture);
    const times = evidence.filter((o) => o.topicSlug === t.slug).map((o) => o.publishedAt).sort();
    const existing = catalog.get(key);
    if (existing) {
      if (times.length) { existing.firstSeenAt = [existing.firstSeenAt, times[0]!].sort()[0]!; existing.lastSeenAt = [existing.lastSeenAt, times.at(-1)!].sort().at(-1)!; }
      return;
    }
    catalog.set(key, { id: (isFixture ? "legacy-fixture-" : "") + t.slug, slug: t.slug, canonicalLabel: t.title, category: t.category, neighborhood: null,
      firstSeenAt: times[0] ?? now.toISOString(), lastSeenAt: times.at(-1) ?? now.toISOString(),
      lifecycle: "inactive", pulseScore: 0, confidence: 0, summary: t.description, enrichmentMethod: t.method, isFixture });
  };
  for (const r of rows[0]?.rows ?? []) addTopic(JSON.parse(String(r.payload)), observations);
  for (const { pulse } of pulses) for (const t of pulse.trends) {
    const fixture = pulse.mode === "demo";
    addTopic(t, fixture ? t.evidence : [...observations, ...t.evidence], fixture);
  }
  for (const { pulse } of pulses) {
    const fixture = pulse.mode === "demo";
    for (const record of catalog.values()) if (record.isFixture === fixture) { record.lifecycle = "inactive"; record.pulseScore = 0; record.confidence = 0; }
    for (const t of pulse.trends) {
      const record = catalog.get(catalogKey(t.slug, fixture))!;
      record.lifecycle = t.lifecycle; record.pulseScore = t.score; record.confidence = t.confidence;
    }
  }
  const statements: InStatement[] = [...catalog.values()].map(topicInsert);
  for (const o of observations) {
    const topic = catalog.get(catalogKey(o.topicSlug, false));
    if (!topic) throw new Error("Legacy item references a missing topic");
    statements.push(itemInsert(fromSignal(o, { topicId: topic.id, category: topic.category, neighborhood: o.neighborhood, localRelevance: 1, enrichmentStatus: "completed" })));
  }
  for (const { id, pulse } of pulses) {
    const fixture = pulse.mode === "demo";
    statements.push({ sql: "INSERT INTO pulse_snapshots(id,captured_at,mode,payload) VALUES (?,?,?,?)", args: [id, pulse.generatedAt!, pulse.mode, JSON.stringify(pulse)] });
    for (const t of pulse.trends) {
      const record = catalog.get(catalogKey(t.slug, fixture))!;
      statements.push(snapshotInsert(topicSnapshot(record.id, t.evidence, new Date(pulse.generatedAt!), t, id)));
      if (fixture) for (const o of t.evidence) statements.push(itemInsert(fromSignal({ ...o, id: "legacy-fixture-" + o.id },
        { topicId: record.id, category: record.category, neighborhood: o.neighborhood, localRelevance: 1, enrichmentStatus: "completed", isFixture: true })));
    }
  }
  if (statements.length) await tx.batch(statements);
}
