import { detectLanguage, type SignalLanguage } from "@/lib/domain/language";
export function LanguageBadge({ text, language: supplied }: { text: string; language?: SignalLanguage }) {
  const language = supplied ?? detectLanguage(text);
  return language === "English" ? null : <span className="language-badge" title="Local script-based language estimate">{language === "other" ? "Other language" : language}</span>;
}
