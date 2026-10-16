import { expect, it } from "vitest";
import { sameSyndicatedContent, syndicationSignature, SyndicationIndex } from "@/lib/pipeline/syndication";

it("preserves every near-copy match across overlap thresholds and day boundaries", () => {
  const index = new SyndicationIndex(), signatures: ReturnType<typeof syndicationSignature>[] = [];
  // Deterministic varied sets: missing prefix terms, added terms, numeric facts,
  // size thresholds and the exact 24-hour time boundary.
  for (const size of [7, 9, 10, 11, 19, 20, 21, 30, 40]) for (const removed of [0, 1, 2, 3, 4]) for (const extra of [0, 1, 2]) {
    const words = Array.from({ length: size }, (_, i) => `term${String(i).padStart(2, "0")}`).slice(removed);
    words.push(...Array.from({ length: extra }, (_, i) => `additional${i}`));
    const title = words.join(" ");
    const signature = syndicationSignature({ title, excerpt: title, domain: "news.example.org",
      publishedAt: new Date(Date.UTC(2026, 9, 15) + signatures.length % 3 * 86400000).toISOString() });
    // Numbers are independently tested by existing duplicate tests. Hold them
    // constant here so all word-overlap boundary cases reach the index.
    signature.numbers = "";
    const expected = signatures.flatMap((previous, i) => sameSyndicatedContent(signature, previous) ? [i] : []);
    const actual = [...index.candidates(signature)].filter((i) => sameSyndicatedContent(signature, signatures[i]!)).sort((a, b) => a - b);
    expect(actual).toEqual(expected);
    index.add(signature, signatures.length); signatures.push(signature);
  }
});

it("does not generate all-pairs comparisons for unrelated retained articles", () => {
  const index = new SyndicationIndex();
  let candidates = 0;
  for (let i = 0; i < 10000; i++) {
    const title = Array.from({ length: 12 }, (_, j) => `article${i}word${j}`).join(" ");
    const signature = syndicationSignature({ title, excerpt: title, domain: "news.example.org", publishedAt: "2026-10-15T12:00:00.000Z" });
    signature.numbers = "";
    candidates += index.candidates(signature).size;
    index.add(signature, i);
  }
  expect(candidates).toBe(0);
});
