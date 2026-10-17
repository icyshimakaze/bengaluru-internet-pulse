import type { PublicTopic } from "@/lib/domain/read-models";
/** Presentation gate only. The deterministic engine and API ranking are unchanged. */
export function leadEligible(topic: Pick<PublicTopic, "score" | "confidence" | "current2h">): boolean {
  return topic.current2h >= 2 && topic.score > 0 && topic.confidence >= 0.35;
}
