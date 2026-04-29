import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

import { readExternalMarketBySourceAndId } from "../../../../api/_shared/external-market-read";
import { readPolymarketGammaFallbackMarkets } from "../../../../api/_shared/polymarket-gamma-fallback";

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
    const market = (await readPolymarketGammaFallbackMarkets()).find((item) =>
      item.source === source &&
      (
        item.externalId.toLowerCase() === normalizedId ||
        item.slug.toLowerCase() === normalizedId ||
        item.id.toLowerCase() === normalizedId
      )
    ) ?? null;

    return NextResponse.json({ market }, { status: market ? 200 : 404 });
  }
}
