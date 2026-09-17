import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db/connect";
import { listLinksForUser } from "@/lib/services/linkService";
import { LinkList } from "@/components/LinkList";
import type { LinkSummaryResponse } from "@/types/api";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  await connectToDatabase();
  const links = await listLinksForUser(session.user.id);
  const serialized: LinkSummaryResponse[] = links.map((link) => ({
    shortCode: link.shortCode,
    longUrl: link.longUrl,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
  }));

  return (
    <main className="flex flex-1 flex-col px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-6 text-2xl font-semibold text-text">My Links</h1>
        <LinkList initialLinks={serialized} />
      </div>
    </main>
  );
}
