import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db/connect";
import { listLinksForUser } from "@/lib/services/linkService";
import { getAnalyticsForUser } from "@/lib/services/analyticsService";
import { LinkList } from "@/components/LinkList";
import type { LinkSummaryResponse } from "@/types/api";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  await connectToDatabase();
  const [links, analytics] = await Promise.all([
    listLinksForUser(session.user.id),
    getAnalyticsForUser(session.user.id),
  ]);
  const clicksByShortCode = new Map(
    analytics.linkBreakdown.map((link) => [link.shortCode, link.totalClicks]),
  );
  const serialized: LinkSummaryResponse[] = links.map((link) => ({
    shortCode: link.shortCode,
    longUrl: link.longUrl,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    totalClicks: clicksByShortCode.get(link.shortCode) ?? 0,
  }));

  return (
    <main className="flex flex-1 flex-col px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-text">My Links</h1>
          <Link
            href="/dashboard/analytics"
            className="text-sm text-text-muted underline hover:text-accent"
          >
            View analytics
          </Link>
        </div>
        <LinkList initialLinks={serialized} />
      </div>
    </main>
  );
}
