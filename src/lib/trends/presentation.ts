import type { Trend } from "@/lib/domain/schema";

export function formatChange(trend: Pick<Trend, "previous2h" | "changeCapped" | "growthPercent">): string {
  return trend.previous2h === 0 ? "No baseline" : trend.changeCapped ? "≥300%" : `${trend.growthPercent > 0 ? "+" : ""}${trend.growthPercent}%`;
}
