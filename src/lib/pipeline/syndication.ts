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
