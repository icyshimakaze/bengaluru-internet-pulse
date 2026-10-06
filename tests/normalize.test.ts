import { describe, expect, it } from "vitest";
import { canonicalUrl, normalize, deduplicate, isBengaluruRelevant, locate } from "@/lib/pipeline/normalize";
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
