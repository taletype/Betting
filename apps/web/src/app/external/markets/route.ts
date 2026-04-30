import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

import { readExternalMarkets } from "../../api/_shared/external-market-read";
import { readPolymarketGammaFallbackMarkets } from "../../api/_shared/polymarket-gamma-fallback";

export const dynamic = "force-dynamic";

const safeMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Market source unavailable";

export async function GET() {
  let backendError: unknown = null;

  try {
    return NextResponse.json(await readExternalMarkets(createSupabaseAdminClient()));
  } catch (error) {
    backendError = error;
    console.warn("legacy /external/markets backend source failed; trying Polymarket Gamma fallback", {
      source: "external_markets",
      message: safeMessage(error),
    });
    try {
      return NextResponse.json(await readPolymarketGammaFallbackMarkets());
    } catch (fallbackError) {
      console.warn("legacy /external/markets Gamma fallback failed", {
        source: "gamma-api.polymarket.com/events",
        message: safeMessage(fallbackError),
      });
      return NextResponse.json(
        {
          ok: false,
          error: "MARKET_SOURCE_UNAVAILABLE",
          source: "external_markets,gamma-api.polymarket.com/events",
          message: `Backend source failed: ${safeMessage(backendError)}; Gamma fallback failed: ${safeMessage(fallbackError)}`,
        },
        { status: 503 },
      );
    }
  }
}
