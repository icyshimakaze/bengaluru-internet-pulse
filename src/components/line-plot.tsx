"use client";
import { memo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatTime } from "@/lib/format";

export type LinePlotProps = {
  rows: { at: string; value: number }[];
  metric: "score" | "signals";
  variant: "momentum" | "snapshot";
  period?: "24h" | "7d" | "30d";
};
export default memo(function LinePlot({ rows, metric, variant, period = "24h" }: LinePlotProps) {
  const snapshot = variant === "snapshot";
  return <ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={rows}
    margin={snapshot ? { top: 18, right: 16, bottom: 7, left: -16 } : { top: 14, right: 12, left: -26, bottom: 5 }} accessibilityLayer={false}>
    <CartesianGrid stroke={snapshot ? "#ddded5" : "#dedfd6"} strokeDasharray={snapshot ? "2 5" : "2 4"} vertical={false} />
    <XAxis dataKey="at" tickFormatter={(value: string) => period === "24h" ? formatTime(value) : formatDate(value).replace(/ \d{4}$/, "")} minTickGap={snapshot ? 65 : 70} tick={{ fill: "#62665d", fontSize: 12 }} axisLine={false} tickLine={false} />
    <YAxis domain={metric === "score" ? [0, 100] : [0, "auto"]} allowDecimals={false} tick={{ fill: "#62665d", fontSize: 12 }} axisLine={false} tickLine={false} />
    <Tooltip labelFormatter={(label) => formatDate(String(label)) + " · " + formatTime(String(label)) + " IST"}
      formatter={(value) => [value, metric === "score" ? snapshot ? "Pulse Score / 100" : "Pulse Score" : snapshot ? "Distinct signals / 2h" : "Distinct signals"]}
      contentStyle={{ background: "#f8f7f2", border: "1px solid #ddded5", borderRadius: 0, boxShadow: "none", fontSize: snapshot ? 12 : 11 }} />
    <Line type="linear" dataKey="value" stroke="#11684f" strokeWidth={2} dot={snapshot ? rows.length <= 8 ? { r: 3 } : false : rows.length === 1 ? { r: 4 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
  </LineChart></ResponsiveContainer>;
});
