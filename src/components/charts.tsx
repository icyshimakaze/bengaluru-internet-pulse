"use client";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Trend } from "@/lib/domain/schema";
import { formatTime } from "@/lib/utils";

export function Sparkline({ history, cooling = false }: { history: Trend["history"]; cooling?: boolean }) {
  return <div aria-hidden="true" className="sparkline"><LineChart width={116} height={42} data={history} accessibilityLayer={false}><Line type="monotone" dataKey="count" stroke={cooling ? "#73736c" : "#11684f"} strokeWidth={1.7} dot={false} isAnimationActive={false} /></LineChart></div>;
}
export function HistoryChart({ history }: { history: Trend["history"] }) {
  return <figure className="history-chart"><div className="chart-container" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={history} margin={{ top: 12, right: 12, left: -22, bottom: 8 }} accessibilityLayer={false}>
    <CartesianGrid stroke="#e4e3dc" vertical={false} /><XAxis dataKey="at" tickFormatter={formatTime} minTickGap={60} tick={{ fill: "#64675f", fontSize: 11 }} axisLine={false} tickLine={false} />
    <YAxis allowDecimals={false} tick={{ fill: "#64675f", fontSize: 11 }} axisLine={false} tickLine={false} />
    <Tooltip labelFormatter={(label) => `${formatTime(String(label))} IST · hour starting`} formatter={(value) => [value, "Distinct items"]} contentStyle={{ borderRadius: 2, borderColor: "#e4e3dc", fontSize: 12 }} />
    <Area type="monotone" dataKey="count" stroke="#11684f" fill="#e2eee6" strokeWidth={2} isAnimationActive={false} />
  </AreaChart></ResponsiveContainer></div><figcaption>Distinct observed items per hour · last 24 hours · IST</figcaption>
    <details className="chart-data"><summary>View chart data as a table</summary><table><caption className="sr-only">Hourly observations</caption><thead><tr><th scope="col">Hour starting (IST)</th><th scope="col">Distinct items</th></tr></thead><tbody>{history.map((h) => <tr key={h.at}><td>{formatTime(h.at)}</td><td>{h.count}</td></tr>)}</tbody></table></details>
  </figure>;
}
