import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

import { readExternalMarkets } from "../../api/_shared/external-market-read";
import { readPolymarketGammaFallbackMarkets } from "../../api/_shared/polymarket-gamma-fallback";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readExternalMarkets(createSupabaseAdminClient()));
  } catch (error) {
    console.warn("serving /external/markets from Polymarket Gamma fallback", error);
    try {
      return NextResponse.json(await readPolymarketGammaFallbackMarkets());
    } catch (fallbackError) {
      console.warn("Polymarket Gamma fallback unavailable; serving safe empty list", fallbackError);
      return NextResponse.json([]);
    }
  }
}
