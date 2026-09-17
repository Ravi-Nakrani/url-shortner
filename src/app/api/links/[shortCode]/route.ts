import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db/connect";
import { updateLinkSchema } from "@/lib/validation/links";
import {
  updateLink,
  deleteLink,
  LinkNotFoundError,
  AliasTakenError,
} from "@/lib/services/linkService";
import { apiError } from "@/lib/api/errors";
import type { LinkSummaryResponse } from "@/types/api";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError(401, "UNAUTHORIZED", "You must be signed in to edit a link.");
  }

  const { shortCode } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateLinkSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await connectToDatabase();
    const updated = await updateLink(shortCode, session.user.id, {
      shortCode: parsed.data.shortCode,
      expiresAt:
        parsed.data.expiresAt === undefined
          ? undefined
          : parsed.data.expiresAt === null
            ? null
            : new Date(parsed.data.expiresAt),
    });

    const response: LinkSummaryResponse = {
      shortCode: updated.shortCode,
      longUrl: updated.longUrl,
      createdAt: updated.createdAt.toISOString(),
      expiresAt: updated.expiresAt?.toISOString() ?? null,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof LinkNotFoundError) {
      return apiError(404, "NOT_FOUND", "Link not found.");
    }
    if (error instanceof AliasTakenError) {
      return apiError(409, "ALIAS_TAKEN", "This alias is already taken.");
    }
    console.error("[links] failed to update link", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError(401, "UNAUTHORIZED", "You must be signed in to delete a link.");
  }

  const { shortCode } = await params;

  try {
    await connectToDatabase();
    await deleteLink(shortCode, session.user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof LinkNotFoundError) {
      return apiError(404, "NOT_FOUND", "Link not found.");
    }
    console.error("[links] failed to delete link", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
