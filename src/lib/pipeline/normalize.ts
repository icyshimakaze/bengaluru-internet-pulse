import { createHash } from "node:crypto";
import { signalSchema, type Signal, type Source, type Neighborhood, neighborhoods } from "@/lib/domain/schema";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function cleanText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}
export function canonicalUrl(value: string): string {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Unsafe URL");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$|ref_src$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
export function normalize(input: { source: Source; sourceId: string; url: string; contentUrl?: string; title: string; text?: string; publishedAt: string; timeKind?: "published" | "discovered" }, now: Date): Signal | null {
  try {
    const date = new Date(input.publishedAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() || date.getTime() < now.getTime() - 14 * 86400000) return null;
    const title = cleanText(input.title).slice(0, 300);
    const text = cleanText(input.text || input.title).slice(0, 4000);
    const content = text.toLowerCase().normalize("NFKC").replace(/https?:\/\/\S+/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const url = canonicalUrl(input.contentUrl ?? input.url);
    return signalSchema.parse({ ...input, id: hash(`${input.source}:${input.sourceId}`), url: input.url, canonicalUrl: url, title, text,
      contentHash: hash(content), publishedAt: date.toISOString(), collectedAt: now.toISOString(), timeKind: input.timeKind ?? "published" });
  } catch { return null; }
}
export function deduplicate<T extends Signal>(signals: readonly T[], existing: readonly Signal[] = []): T[] {
  const urls = new Set(existing.map((s) => s.canonicalUrl));
  const contents = new Set(existing.map((s) => s.contentHash));
  const ids = new Set(existing.map((s) => s.id));
  return [...signals].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id)).filter((s) => {
    if (urls.has(s.canonicalUrl) || contents.has(s.contentHash) || ids.has(s.id)) return false;
    urls.add(s.canonicalUrl); contents.add(s.contentHash); ids.add(s.id); return true;
  });
}
export function isBengaluruRelevant(text: string): boolean { return /\b(bengaluru|bangalore|bengalooru|namma\s+metro|bmrcl|bbmp)\b|ಬೆಂಗಳೂರು/i.test(text); }
export function locate(text: string): Neighborhood | null {
  return neighborhoods.find((n) => new RegExp(`\\b${n.replace(/ /g, "\\s+")}\\b`, "i").test(text)) ?? null;
}
