export const languages = ["English", "Hindi", "Kannada", "Tamil", "other"] as const;
export type SignalLanguage = typeof languages[number];

/** Script hint, not linguistic identification: Devanagari is shown as Hindi.
 * Mixed text uses the most frequent supported non-Latin script. */
export function detectLanguage(value: string): SignalLanguage {
  const text = value.replace(/https?:\/\/\S+/giu, "");
  const scripts = [["Kannada", /[\u0c80-\u0cff]/gu], ["Tamil", /[\u0b80-\u0bff]/gu],
    ["Hindi", /[\u0900-\u097f]/gu]] as const;
  const counts = scripts.map(([name, pattern]) => ({ name, count: (text.match(pattern) ?? []).length }));
  const dominant = counts.sort((a, b) => b.count - a.count)[0]!;
  if (dominant.count >= 2) return dominant.name;
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text)) return "other";
  return /\p{Script=Latin}/u.test(text) ? "English" : "other";
}
