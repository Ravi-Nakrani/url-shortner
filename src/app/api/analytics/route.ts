import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db/connect";
import { getAnalyticsForUser } from "@/lib/services/analyticsService";
import { apiError } from "@/lib/api/errors";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError(401, "UNAUTHORIZED", "You must be signed in to view analytics.");
  }

  try {
    await connectToDatabase();
    const summary = await getAnalyticsForUser(session.user.id);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[analytics] failed to load analytics", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
