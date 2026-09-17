import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connect";
import { createLinkSchema } from "@/lib/validation/links";
import { createLink, ShortCodeExhaustedError } from "@/lib/services/linkService";
import { apiError } from "@/lib/api/errors";
import type { CreateLinkResponse } from "@/types/api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createLinkSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await connectToDatabase();
    const link = await createLink(parsed.data.longUrl);

    const baseUrl = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
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
