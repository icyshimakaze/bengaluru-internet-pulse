import { describe, expect, it } from "vitest";
import { canonicalUrl, normalize, deduplicate, contentFingerprint, isBengaluruRelevant, locate } from "@/lib/pipeline/normalize";
import { signalSchema } from "@/lib/domain/schema";
import { classifyLocal } from "@/lib/pipeline/topics";
import { now, observation } from "./helpers";
describe("normalization and canonicalization", () => {
  it("strips tracking and canonicalizes without discarding meaningful query params", () => {
    expect(canonicalUrl("https://www.EXAMPLE.com/path/?utm_source=foo&b=2&a=1#fragment")).toBe("https://example.com/path?a=1&b=2");
    expect(() => canonicalUrl("javascript:alert(1)")).toThrow();
    expect(() => canonicalUrl("https://user:pass@example.org")).toThrow();
  });
  it("rejects future dates, invalid dates and unsafe URLs", () => {
    const base = { source: "gdelt" as const, sourceId: "x", url: "https://example.com", title: "Bengaluru metro", publishedAt: now.toISOString() };
    expect(normalize({ ...base, publishedAt: "bad" }, now)).toBeNull();
    expect(normalize({ ...base, publishedAt: new Date(now.getTime() + 1).toISOString() }, now)).toBeNull();
    expect(normalize({ ...base, url: "javascript:alert(1)" }, now)).toBeNull();
  });
  it("deduplicates URLs, content and already stored identities across sources", () => {
    const a = observation("a", 1), b = observation("b", 1, "gdelt"), c = observation("c", 1);
    expect(deduplicate([a, { ...b, canonicalUrl: a.canonicalUrl }, { ...c, contentHash: a.contentHash }])).toHaveLength(1);
    expect(deduplicate([a], [a])).toEqual([]);
  });
  it("uses normalized title, publisher domain and content to detect syndicated copies", () => {
    const a = { title: "Bengaluru METRO expands — publisherone", excerpt: "Bengaluru METRO expands — publisherone", domain: "publisherone.com" };
    const b = { title: "Bengaluru metro expands | publishertwo", excerpt: "Bengaluru metro expands | publishertwo", domain: "publishertwo.org" };
    expect(contentFingerprint(a)).toBe(contentFingerprint(b));
    expect(contentFingerprint(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(contentFingerprint({ ...a, excerpt: "Bengaluru metro details changed today" })).not.toBe(contentFingerprint(a));
    expect(contentFingerprint({ ...a, title: "Bengaluru airport expands" })).not.toBe(contentFingerprint(a));
    expect(contentFingerprint({ title: "Bengaluru café", excerpt: "Bengaluru cafe\u0301", domain: "a.org" }))
      .toBe(contentFingerprint({ title: "Bengaluru café", excerpt: "Bengaluru café", domain: "b.org" }));
  });
  it("detects source identities and content retained under the old fingerprint format", () => {
    const a = observation("legacy", 1), b = observation("new-copy", 1, "gdelt");
    expect(deduplicate([{ ...b, id: "another-id", source: a.source, sourceId: a.sourceId }], [a])).toEqual([]);
    const copy = normalize({ source: "gdelt", sourceId: "syndicated-copy", url: "https://different.org/story", title: a.title, text: a.text, publishedAt: a.publishedAt }, now)!;
    expect(deduplicate([copy], [{ ...a, contentHash: "legacy-hash" }])).toEqual([]);
  });
  it("deduplicates long near-identical syndicated copies while retaining independent reports and changed facts", () => {
    const title = "Bengaluru metro transports donated organ from hospital to hospital for emergency surgery";
    const a = normalize({ source: "gdelt", sourceId: "a", url: "https://publisher.org/a", title, publishedAt: now.toISOString() }, now)!;
    const copy = normalize({ source: "gdelt", sourceId: "b", url: "https://syndicator.org/b", title: title + " today", publishedAt: now.toISOString() }, now)!;
    const independent = normalize({ source: "gdelt", sourceId: "c", url: "https://reporter.org/c", title: "Donor organ transported by Namma Metro in Bengaluru medical emergency", publishedAt: now.toISOString() }, now)!;
    expect(deduplicate([a, copy, independent])).toHaveLength(2);
    expect(deduplicate([copy], [a])).toEqual([]);
    expect(deduplicate([{ ...a, title: title + " 25" }, { ...copy, title: title + " 30" }])).toHaveLength(2);
    expect(deduplicate([a, { ...copy, excerpt: "Independent interview with doctors about the recipient and treatment during the emergency." }])).toHaveLength(2);
  });
  it("reads old snapshots with derived normalized fields and rejects impossible dates", () => {
    const current = observation("old-shape", 1);
    const { excerpt: _excerpt, domain: _domain, sourceType: _type, ...legacy } = current;
    void _excerpt; void _domain; void _type;
    expect(signalSchema.parse(legacy)).toMatchObject({ excerpt: legacy.text, domain: "example.org", sourceType: "social" });
    expect(normalize({ source: "gdelt", sourceId: "calendar", url: "https://example.org", title: "Bengaluru metro", publishedAt: "2026-09-31T00:00:00.000Z" }, now)).toBeNull();
  });
  it("rejects non-city signals and identifies explicit neighborhoods", () => {
    expect(isBengaluruRelevant("London startups and traffic")).toBe(false);
    expect(isBengaluruRelevant("ಬೆಂಗಳೂರು" )).toBe(true);
    expect(locate("Rain in Whitefield, Bengaluru")).toBe("Whitefield");
    expect(locate("Citywide traffic in Bengaluru")).toBeNull();
  });
  it("matches synonymous metro references to one canonical topic", () => {
    const a = { ...observation("a", 1), text: "Bengaluru Purple Line metro discussion" };
    const b = { ...observation("b", 1), text: "BMRCL service update in Bangalore" };
    expect(classifyLocal(a, [])?.topic.slug).toBe("namma-metro");
    expect(classifyLocal(b, [])?.topic.slug).toBe("namma-metro");
    expect(classifyLocal({ ...a, text: "Paris Metro discussion" }, [])).toBeNull();
  });
});
