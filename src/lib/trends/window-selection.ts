import type { ReadQuery } from "@/lib/domain/read-models";

export const activityWindows = ["2h", "6h", "24h"] as const;
export function meaningfulWindow(coverage: ReadonlyArray<{ window: ReadQuery["window"]; topics: number; signals: number }>): ReadQuery["window"] {
  return coverage.find((row) => row.topics > 0)?.window
    ?? coverage.find((row) => row.signals > 0)?.window ?? "2h";
}
