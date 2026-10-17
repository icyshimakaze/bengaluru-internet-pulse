import type { SnapshotRecord } from "@/lib/db/records";
import { writeCsv } from "./csv";
export function backtestTimeline(slug: string, rows: readonly SnapshotRecord[]) {
  const points = [...rows].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.algorithmVersion.localeCompare(b.algorithmVersion));
  const columns = ["captured_at", "algorithm_version", "pulse_score", "signals_2h", "signals_24h", "source_count"];
  const values = points.map((row) => [row.capturedAt, row.algorithmVersion, row.pulseScore, row.count2h, row.count24h, row.sourceCount]);
  return { csv: writeCsv([columns, ...values]), markdown: `# Stored timeline: ${slug}\n\nRead-only historical snapshots. Versions are separate; gaps are not interpolated.\n\n| Captured (UTC) | Version | Score | Signals 2H | Signals 24H | Sources |\n| --- | --- | ---: | ---: | ---: | ---: |\n${values.map((row) => "| " + row.join(" | ") + " |").join("\n")}\n${points.length ? "" : "\nNo stored snapshots found. No timeline values were invented.\n"}` };
}
