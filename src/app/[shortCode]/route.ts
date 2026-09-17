import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connect";
import { findLinkByShortCode } from "@/lib/services/linkService";
import { recordClickEvent } from "@/lib/services/outboxService";
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

    const outboxStart = Date.now();
    try {
      await recordClickEvent(shortCode, {
        referrer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
      });
      console.log(`[outbox] recorded click for ${shortCode} in ${Date.now() - outboxStart}ms`);
    } catch (error) {
      // The redirect is the only thing the user is waiting on; losing one click
      // event to a transient DB error shouldn't turn into a failed redirect.
      console.error(`[outbox] failed to record click for ${shortCode}`, error);
    }

    return NextResponse.redirect(link.longUrl, 301);
  } catch (error) {
    console.error("[redirect] failed to resolve short code", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
