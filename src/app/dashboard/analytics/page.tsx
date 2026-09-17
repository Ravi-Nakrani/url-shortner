import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db/connect";
import { getAnalyticsForUser } from "@/lib/services/analyticsService";
import { ClicksOverTimeChart } from "@/components/analytics/ClicksOverTimeChart";
import { TopReferrersList } from "@/components/analytics/TopReferrersList";
import { LinkBreakdownTable } from "@/components/analytics/LinkBreakdownTable";

function formatFreshness(lastDrainedAt: string | null): string {
  if (!lastDrainedAt) return "Data current as of: not yet available (no drain has run)";
  const date = new Date(lastDrainedAt);
  return `Data current as of ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} on ${date.toLocaleDateString()}`;
}

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  await connectToDatabase();
  const analytics = await getAnalyticsForUser(session.user.id);

  return (
    <main className="flex flex-1 flex-col px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-1 text-2xl font-semibold text-text">Analytics</h1>
        <p className="text-sm text-text-muted">
          Click data is processed asynchronously by a background worker, so it may lag behind real
          clicks by a few minutes.
        </p>
        <p className="mb-8 text-sm text-text-muted">{formatFreshness(analytics.lastDrainedAt)}</p>

        <div className="mb-8 border border-border p-4">
          <ClicksOverTimeChart data={analytics.clicksOverTime} />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="border border-border p-4">
            <TopReferrersList data={analytics.topReferrers} />
          </div>
          <div className="border border-border p-4">
            <LinkBreakdownTable data={analytics.linkBreakdown} />
          </div>
        </div>
      </div>
    </main>
  );
}
