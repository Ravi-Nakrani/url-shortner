import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connect";
import { drainOutbox } from "@/lib/services/outboxDrainService";
import { apiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import type { ProcessOutboxResponse } from "@/types/api";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-outbox-secret");
  if (!secret || secret !== env.OUTBOX_SECRET) {
    return apiError(401, "UNAUTHORIZED", "Unauthorized");
  }

  try {
    await connectToDatabase();
    const result = await drainOutbox();
    const response: ProcessOutboxResponse = result;
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[process-outbox] drain failed", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to process outbox events.");
  }
}
