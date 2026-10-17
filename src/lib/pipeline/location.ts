import { neighborhoods, gazetteer } from "@/lib/domain/places";
import { normalizeText } from "./matching";

const matchers = neighborhoods.map((area) => ({ area, requiresCityContext: gazetteer[area].requiresCityContext,
  patterns: gazetteer[area].aliases.map((alias) => {
    const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replaceAll(" ", "\\s+");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u");
  }) }));

export function mentionedNeighborhoods(text: string) {
  const value = normalizeText(text);
  const city = /\b(bengaluru|bangalore|bengalooru|bmrcl|bbmp|bwssb|bescom|namma\s+metro)\b|ಬೆಂಗಳೂರು/iu.test(value);
  return matchers.filter((entry) => (!entry.requiresCityContext || city) && entry.patterns.some((pattern) => pattern.test(value))).map((entry) => entry.area);
}
export function detectBengaluru(text: string): boolean {
  const value = normalizeText(text);
  // A link path, ambiguous road name or another city's Whitefield is insufficient.
  if (/\b(bengaluru|bangalore|bengalooru|bmrcl|bbmp|bwssb|bescom|namma\s+metro|kempegowda)\b|ಬೆಂಗಳೂರು/iu.test(value)) return true;
  if (/\b(delhi|mumbai|chennai|hyderabad|pune|gurugram|gurgaon|kochi|kolkata|manchester|london)\b/u.test(value)) return false;
  return mentionedNeighborhoods(value).some((area) => area !== "MG Road");
}
