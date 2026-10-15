import { neighborhoods } from "@/lib/domain/schema";
import { normalizeText } from "./matching";

export function mentionedNeighborhoods(text: string) {
  const value = normalizeText(text);
  return neighborhoods.filter((area) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${area.toLowerCase().replaceAll(" ", "\\s+")}(?:$|[^\\p{L}\\p{N}])`, "u").test(value));
}
export function detectBengaluru(text: string): boolean {
  const value = normalizeText(text);
  // A link path, ambiguous road name or another city's Whitefield is insufficient.
  if (/\b(bengaluru|bangalore|bengalooru|bmrcl|bbmp|bwssb|bescom|namma\s+metro|kempegowda)\b|ಬೆಂಗಳೂರು/iu.test(value)) return true;
  if (/\b(delhi|mumbai|chennai|hyderabad|pune|gurugram|gurgaon|kochi|kolkata|manchester|london)\b/u.test(value)) return false;
  return mentionedNeighborhoods(value).some((area) => area !== "MG Road");
}
