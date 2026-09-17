"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReferrerBreakdown } from "@/lib/services/analyticsService";

const MAX_LABEL_CHARS = 12;

function truncateLabel(value: string): string {
  return value.length > MAX_LABEL_CHARS ? `${value.slice(0, MAX_LABEL_CHARS - 1)}…` : value;
}

function ReferrerTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (x === undefined || y === undefined || !payload) return null;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="var(--text-muted)" fontSize={12}>
      {truncateLabel(payload.value)}
    </text>
  );
}

function ReferrerTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ReferrerBreakdown }[];
}) {
  if (!active || !payload?.length) return null;
  const { referrer, clicks } = payload[0].payload;
  return (
    <div className="border border-border bg-surface px-3 py-2 text-sm">
      <p className="font-semibold text-text">{clicks.toLocaleString()} clicks</p>
      <p className="text-text-muted">{referrer}</p>
    </div>
  );
}

export function TopReferrersList({ data }: { data: ReferrerBreakdown[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-text-muted">Top referrers</h2>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No referrer data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(data.length * 40, 80)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 32, bottom: 0, left: 8 }}
            barCategoryGap={12}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="referrer"
              width={100}
              tick={<ReferrerTick />}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ReferrerTooltip />}
              cursor={{ fill: "var(--border)", opacity: 0.3 }}
            />
            <Bar dataKey="clicks" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={20}>
              <LabelList
                dataKey="clicks"
                position="right"
                fill="var(--text)"
                fontSize={12}
                formatter={(value: unknown) =>
                  typeof value === "number" ? value.toLocaleString() : ""
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
