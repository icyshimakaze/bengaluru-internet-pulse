import type { TopicDetailData } from "@/lib/domain/read-models";

// Project only the values the homepage chart consumes from an already validated detail.
export function chartHistory(detail: TopicDetailData) {
  return { mode: detail.mode, generatedAt: detail.generatedAt, topicSlug: detail.topic.slug,
    evaluatedAt: detail.snapshot.evaluatedAt, historyTruncated: detail.historyTruncated,
    history: detail.history.map(({ capturedAt, algorithmVersion, pulseScore }) => ({ capturedAt, algorithmVersion, pulseScore })) };
}
export type ChartHistoryData = ReturnType<typeof chartHistory>;
