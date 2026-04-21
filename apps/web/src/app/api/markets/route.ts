import { NextResponse } from "next/server";
import { getMarketsResponse } from "../_shared/market-route-response";

export async function GET() {
  try {
    return await getMarketsResponse();
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
