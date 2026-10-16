import type { Signal } from "@/lib/domain/schema";

type Content = Pick<Signal, "title" | "excerpt" | "domain" | "publishedAt">;
const ignored = new Set("the and for with from this that have has are was were into about after before said says bengaluru bangalore today".split(" "));
function words(value: string): Set<string> {
  return new Set((value.normalize("NFKC").toLowerCase().replace(/https?:\/\/\S+/gu, " ").match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length >= 3 && !ignored.has(word) || /^\d+$/u.test(word)));
}
export function syndicationSignature(signal: Content) {
  return { title: words(signal.title), excerpt: words(signal.excerpt), numbers: (signal.title.match(/\d+/gu) ?? []).join("|"),
    linked: !["bsky.app", "news.ycombinator.com"].includes(signal.domain), time: Date.parse(signal.publishedAt) };
}
type Signature = ReturnType<typeof syndicationSignature>;
function almostEqual(a: Set<string>, b: Set<string>, minimum: number) {
  if (Math.min(a.size, b.size) < minimum) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / a.size >= 0.9 && shared / b.size >= 0.9;
}
export function sameSyndicatedContent(a: Signature, b: Signature): boolean {
  // Event equivalence is deliberately looser than duplicate evidence. Independent
  // reporting and personal commentary must still count as distinct observations.
  if (!a.linked || !b.linked || a.numbers !== b.numbers || Math.abs(a.time - b.time) > 86400000) return false;
  return almostEqual(a.title, b.title, 7) && almostEqual(a.excerpt, b.excerpt, 7);
}

// At 90% overlap two sorted sets must share a word in their first
// floor(size / 10) + 1 terms. Use that necessary condition to avoid comparing
// every retained article with every other article. The final rule is unchanged.
export class SyndicationIndex {
  private readonly buckets = new Map<string, Set<number>>();
  private keys(signature: Signature): string[] {
    if (!signature.linked || signature.title.size < 7 || signature.excerpt.size < 7) return [];
    return [...signature.title].sort().slice(0, Math.floor(signature.title.size / 10) + 1);
  }
  add(signature: Signature, index: number) {
    const day = Math.floor(signature.time / 86400000);
    for (const word of this.keys(signature)) {
      const key = JSON.stringify([day, signature.numbers, word]);
      const bucket = this.buckets.get(key) ?? new Set<number>();
      bucket.add(index); this.buckets.set(key, bucket);
    }
  }
  candidates(signature: Signature): Set<number> {
    const day = Math.floor(signature.time / 86400000), matches = new Set<number>();
    for (const word of this.keys(signature)) for (const delta of [-1, 0, 1]) {
      for (const index of this.buckets.get(JSON.stringify([day + delta, signature.numbers, word])) ?? []) matches.add(index);
    }
    return matches;
  }
}
