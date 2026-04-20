import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";
import { readMarkets } from "../_shared/market-read";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    return NextResponse.json(await readMarkets(supabase));
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
