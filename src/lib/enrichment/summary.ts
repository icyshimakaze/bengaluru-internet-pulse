import "server-only";
import type { Signal } from "@/lib/domain/schema";

// Source text, never a generated assertion. Keep the same extractive summary
// for gateway classification and genuine local fallback.
export function factualSummary(signal: Signal): string {
  const fragment = signal.title.split(/[<>\x00-\x1f]/u).find((part) => part.trim().length >= 3)
    ?? signal.excerpt.split(/[<>\x00-\x1f]/u).find((part) => part.trim().length >= 3) ?? "";
  return `Public mentions: ${fragment.trim().split(/\s+/u).slice(0, 22).join(" ").slice(0, 260).trim()}`;
}
