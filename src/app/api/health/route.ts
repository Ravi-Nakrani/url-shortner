import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connect";

export async function GET() {
  try {
    const mongoose = await connectToDatabase();
    return NextResponse.json({
      status: "ok",
      dbState: mongoose.connection.readyState === 1 ? "connected" : "not connected",
    });
  } catch (error) {
    console.error("[health] database connection failed", error);
    return NextResponse.json(
      { status: "error", message: "Database connection failed" },
      { status: 500 },
    );
  }
}
