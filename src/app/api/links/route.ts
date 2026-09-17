import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db/connect";
import { createLinkSchema } from "@/lib/validation/links";
import { createLink, listLinksForUser, ShortCodeExhaustedError } from "@/lib/services/linkService";
import { checkRateLimit } from "@/lib/services/rateLimitService";
import { getClientIp } from "@/lib/http/getClientIp";
import { apiError } from "@/lib/api/errors";
import type { CreateLinkResponse, ListLinksResponse } from "@/types/api";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(
      `create-link:${ip}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      return apiError(429, "RATE_LIMITED", "Too many links created. Please try again shortly.", {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const body = await request.json().catch(() => null);
    const parsed = createLinkSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const baseUrl = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
    if (new URL(parsed.data.longUrl).host === new URL(baseUrl).host) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Cannot shorten a link that points back at this app.",
      );
    }

    const session = await auth();
    const link = await createLink(parsed.data.longUrl, session?.user?.id ?? null);

    const response: CreateLinkResponse = {
      shortCode: link.shortCode,
      shortUrl: `${baseUrl}/${link.shortCode}`,
      longUrl: link.longUrl,
      createdAt: link.createdAt.toISOString(),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof ShortCodeExhaustedError) {
      console.error("[links] short code space exhausted", error);
      return apiError(500, "INTERNAL_ERROR", "Could not generate a short link. Please try again.");
    }
    console.error("[links] failed to create link", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError(401, "UNAUTHORIZED", "You must be signed in to view your links.");
  }

  try {
    await connectToDatabase();
    const links = await listLinksForUser(session.user.id);
    const response: ListLinksResponse = {
      links: links.map((link) => ({
        shortCode: link.shortCode,
        longUrl: link.longUrl,
        createdAt: link.createdAt.toISOString(),
        expiresAt: link.expiresAt?.toISOString() ?? null,
      })),
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("[links] failed to list links", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
