"use client";
import { TopicRecovery } from "@/components/topic-recovery";
export default function TopicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <TopicRecovery reset={reset} />;
}
