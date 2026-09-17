"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyClicks } from "@/lib/services/analyticsService";

function formatShortDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-border bg-surface px-3 py-2 text-sm shadow-none">
      <p className="font-semibold text-text">{payload[0].value.toLocaleString()} clicks</p>
      <p className="text-text-muted">{label ? formatShortDate(label) : ""}</p>
    </div>
  );
}

export function ClicksOverTimeChart({ data }: { data: DailyClicks[] }) {
  const hasAnyClicks = data.some((point) => point.clicks > 0);

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-text-muted">Clicks, last 30 days</h2>
      {!hasAnyClicks ? (
        <p className="py-8 text-center text-sm text-text-muted">No clicks recorded yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval={Math.ceil(data.length / 5) - 1}
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="clicks"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="var(--accent)"
              fillOpacity={0.1}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
