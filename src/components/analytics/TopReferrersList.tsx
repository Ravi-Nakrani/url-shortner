"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { ReferrerBreakdown } from "@/lib/services/analyticsService";

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
            margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
            barCategoryGap={12}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="referrer"
              width={110}
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
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
