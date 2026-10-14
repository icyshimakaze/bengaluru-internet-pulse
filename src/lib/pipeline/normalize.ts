import { createHash } from "node:crypto";
import { z } from "zod";
import { signalSchema, sourceTypeFor, type Signal, type Source, type Neighborhood, neighborhoods } from "@/lib/domain/schema";
import { sameSyndicatedContent, syndicationSignature } from "./syndication";

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
function characteristic(value: string): string {
  return cleanText(value).normalize("NFKC").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function unbrand(value: string, domain: string): string {
  const parts = cleanText(value).split(/\s+[|–—-]\s+/u);
  if (parts.length < 2) return value;
  const suffix = characteristic(parts.at(-1)!);
  const hostname = domain.toLowerCase().replace(/^www\./, "");
  const publisher = characteristic(hostname.split(".")[0] ?? "");
  if (suffix === characteristic(hostname) || (publisher.length >= 4 && suffix.replaceAll(" ", "") === publisher.replaceAll(" ", ""))) {
    parts.pop(); return parts.join(" — ");
  }
  return value;
}
export function contentFingerprint(input: { title: string; excerpt: string; domain: string }): string {
  const title = characteristic(unbrand(input.title, input.domain));
  const content = characteristic(unbrand(input.excerpt, input.domain));
  // Domain removes publisher branding; it is deliberately not a hash salt,
  // so the same syndicated headline/content on different domains can match.
  return hash(JSON.stringify({ version: 2, title, content: content === title ? "" : content }));
}
export function normalize(input: { source: Source; sourceId: string; url: string; contentUrl?: string; title: string; text?: string; publishedAt: string; timeKind?: "published" | "discovered" }, now: Date): Signal | null {
  try {
    const date = new Date(z.iso.datetime({ offset: true }).parse(input.publishedAt));
    if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() || date.getTime() < now.getTime() - 14 * 86400000) return null;
    const title = cleanText(input.title).slice(0, 300);
    const text = (cleanText(input.text ?? "") || title).slice(0, 4000);
    const url = canonicalUrl(input.contentUrl ?? input.url);
    canonicalUrl(input.url);
    const domain = new URL(url).hostname;
    return signalSchema.parse({ ...input, id: hash(`${input.source}:${input.sourceId}`), url: input.url, canonicalUrl: url, title, text,
      excerpt: text, domain, sourceType: sourceTypeFor[input.source], contentHash: contentFingerprint({ title, excerpt: text, domain }),
      publishedAt: date.toISOString(), collectedAt: now.toISOString(), timeKind: input.timeKind ?? "published" });
  } catch { return null; }
}
export function deduplicate<T extends Signal>(signals: readonly T[], existing: readonly Signal[] = []): T[] {
  const urls = new Set(existing.map((s) => s.canonicalUrl));
  const contents = new Set(existing.flatMap((s) => [s.contentHash, contentFingerprint({ title: s.title, excerpt: s.text, domain: s.domain })]));
  const ids = new Set(existing.map((s) => s.id));
  const sourceIds = new Set(existing.map((s) => `${s.source}:${s.sourceId}`));
  const copies = existing.map(syndicationSignature);
  return [...signals].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id)).filter((s) => {
    const identity = `${s.source}:${s.sourceId}`;
    if (urls.has(s.canonicalUrl) || contents.has(s.contentHash) || ids.has(s.id) || sourceIds.has(identity)) return false;
    const signature = syndicationSignature(s);
    if (copies.some((copy) => sameSyndicatedContent(signature, copy))) return false;
    copies.push(signature);
    urls.add(s.canonicalUrl); contents.add(s.contentHash); ids.add(s.id); sourceIds.add(identity); return true;
  });
}
export function isBengaluruRelevant(text: string): boolean { return /\b(bengaluru|bangalore|bengalooru|namma\s+metro|bmrcl|bbmp)\b|ಬೆಂಗಳೂರು/i.test(text); }
export function locate(text: string): Neighborhood | null {
  const areas = neighborhoods.filter((n) => new RegExp(`\\b${n.replace(/ /g, "\\s+")}\\b`, "i").test(text.replace(/https?:\/\/\S+/gu, " ")));
  return areas.length === 1 ? areas[0]! : null;
}
