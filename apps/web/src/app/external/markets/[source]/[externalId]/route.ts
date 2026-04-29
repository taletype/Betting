import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

import { readExternalMarketBySourceAndId } from "../../../../api/_shared/external-market-read";
import {
  readPolymarketGammaFallbackMarketBySlugOrId,
  readPolymarketGammaFallbackMarkets,
} from "../../../../api/_shared/polymarket-gamma-fallback";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; externalId: string }> },
) {
  const { source, externalId } = await params;

  try {
    const market = await readExternalMarketBySourceAndId(createSupabaseAdminClient(), source, externalId);
    return NextResponse.json({ market }, { status: market ? 200 : 404 });
  } catch (error) {
    console.warn("serving external market detail from Polymarket Gamma fallback", error);
    const normalizedId = decodeURIComponent(externalId).toLowerCase();
    let market = null;
    try {
      market = source === "polymarket"
        ? await readPolymarketGammaFallbackMarketBySlugOrId(externalId)
        : null;
    } catch (directFallbackError) {
      console.warn("direct Polymarket Gamma market fallback unavailable", directFallbackError);
    }

    if (!market) {
      try {
        market = (await readPolymarketGammaFallbackMarkets()).find((item) =>
          item.source === source &&
          (
            item.externalId.toLowerCase() === normalizedId ||
            item.slug.toLowerCase() === normalizedId ||
            item.id.toLowerCase() === normalizedId
          )
        ) ?? null;
      } catch (listFallbackError) {
        console.warn("Polymarket Gamma list fallback unavailable", listFallbackError);
      }
    }

    return NextResponse.json({ market }, { status: market ? 200 : 404 });
  }
}
