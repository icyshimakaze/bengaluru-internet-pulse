"use client";
import { memo, useSyncExternalStore } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatTime } from "@/lib/format";

export type LinePlotProps = {
  rows: { at: string; value: number }[];
  metric: "score" | "signals";
  variant: "momentum" | "snapshot";
  period?: "24h" | "7d" | "30d";
};
const subscribeMotion = (callback: () => void) => {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  preference.addEventListener("change", callback);
  return () => preference.removeEventListener("change", callback);
};
export default memo(function LinePlot({ rows, metric, variant, period = "24h" }: LinePlotProps) {
  const snapshot = variant === "snapshot";
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const peak = rows.length > 2 ? rows.reduce((best, row) => row.value > best.value ? row : best, rows[0]!) : null;
  return <ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={rows}
    margin={snapshot ? { top: 18, right: 16, bottom: 7, left: -16 } : { top: 14, right: 12, left: -26, bottom: 5 }} accessibilityLayer={false}>
    <CartesianGrid stroke="var(--border)" strokeDasharray="2 5" vertical={false} />
    <XAxis dataKey="at" tickFormatter={(value: string) => period === "24h" ? formatTime(value) : formatDate(value).replace(/ \d{4}$/, "")} minTickGap={snapshot ? 65 : 70} tick={{ fill: "#62665d", fontSize: 12 }} axisLine={false} tickLine={false} />
    <YAxis domain={metric === "score" ? [0, 100] : [0, "auto"]} allowDecimals={false} tick={{ fill: "#62665d", fontSize: 12 }} axisLine={false} tickLine={false} />
    <Tooltip labelFormatter={(label) => formatDate(String(label)) + " · " + formatTime(String(label)) + " IST"}
      formatter={(value) => [value, metric === "score" ? snapshot ? "Pulse Score / 100" : "Pulse Score" : snapshot ? "Distinct signals / 2h" : "Distinct signals"]}
      cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 4" }}
      contentStyle={{ background: "var(--background)", border: "1px solid var(--border-strong)", borderRadius: 0, boxShadow: "0 6px 20px #252e2910", fontFamily: "var(--font-interface), sans-serif", fontSize: 12, padding: "12px 16px" }} />
    <Line type="linear" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={snapshot ? rows.length <= 8 ? { r: 3 } : false : rows.length === 1 ? { r: 4 } : false} activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }} isAnimationActive={!reducedMotion} animationDuration={500} animationEasing="ease-out" />
    {peak && peak.value > 0 && <ReferenceDot x={peak.at} y={peak.value} r={3} fill="var(--accent)" stroke="var(--background)" label={{ value: `Peak ${peak.value}`, position: "top", fill: "var(--muted-foreground)", fontSize: 10 }} />}
  </LineChart></ResponsiveContainer>;
});
