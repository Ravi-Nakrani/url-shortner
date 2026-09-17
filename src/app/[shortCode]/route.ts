import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connect";
import { findLinkByShortCode } from "@/lib/services/linkService";
import { apiError } from "@/lib/api/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;

  try {
    await connectToDatabase();
    const link = await findLinkByShortCode(shortCode);

    if (!link) {
      return apiError(404, "NOT_FOUND", "This short link does not exist or has expired.");
    }

    return NextResponse.redirect(link.longUrl, 301);
  } catch (error) {
    console.error("[redirect] failed to resolve short code", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
