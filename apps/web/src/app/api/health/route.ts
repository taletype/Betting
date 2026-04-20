import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "api",
    timestamp: new Date().toISOString(),
    env: process.env.DATABASE_URL ? "DATABASE_URL set" : "DATABASE_URL missing",
  });
}
