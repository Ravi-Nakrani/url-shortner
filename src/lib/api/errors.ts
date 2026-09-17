import { NextResponse } from "next/server";
import type { ApiErrorResponse } from "@/types/api";

export function apiError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}
