import { NextResponse } from "next/server";
import { getMarketsResponse } from "../_shared/market-route-response";

export async function GET() {
  try {
    return await getMarketsResponse();
  } catch (error) {
    console.warn("public market list unavailable; serving safe empty state", error);
    return NextResponse.json([]);
  }
}
