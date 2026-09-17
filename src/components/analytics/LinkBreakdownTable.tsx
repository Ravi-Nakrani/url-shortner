import type { LinkBreakdown } from "@/lib/services/analyticsService";

export function LinkBreakdownTable({ data }: { data: LinkBreakdown[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-text-muted">Per-link breakdown</h2>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          You haven&apos;t created any links yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-20" />
              <col />
              <col className="w-16" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-2 pr-2 font-medium">Link</th>
                <th className="py-2 pr-2 font-medium">Destination</th>
                <th className="py-2 pr-1 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {data.map((link) => (
                <tr key={link.shortCode} className="border-b border-border">
                  <td className="truncate py-2 pr-2 font-mono text-accent">{link.shortCode}</td>
                  <td className="truncate py-2 pr-2 text-text-muted" title={link.longUrl}>
                    {link.longUrl}
                  </td>
                  <td className="py-2 pr-1 text-right font-medium tabular-nums text-text">
                    {link.totalClicks.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
