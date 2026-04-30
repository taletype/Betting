import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import { readExternalMarketBySourceAndId } from "../../../../../api/_shared/external-market-read";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; externalId: string }> },
) {
  const { source, externalId } = await params;

  try {
    const market = await readExternalMarketBySourceAndId(createSupabaseAdminClient(), source, externalId);
    const lastUpdatedAt = market?.lastUpdatedAt ?? market?.lastSyncedAt ?? null;
    return NextResponse.json({
      source,
      externalId,
      volume24h: market?.volume24h ?? null,
      liquidity: market?.liquidity ?? market?.volumeTotal ?? null,
      spread: market?.bestBid !== null && market?.bestAsk !== null && market?.bestBid !== undefined && market?.bestAsk !== undefined
        ? Math.max(0, market.bestAsk - market.bestBid)
        : null,
      closeTime: market?.closeTime ?? null,
      lastUpdatedAt,
      stale: lastUpdatedAt ? Date.now() - new Date(lastUpdatedAt).getTime() > 15 * 60 * 1000 : true,
    });
  } catch (error) {
    console.warn("external market stats unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, volume24h: null, liquidity: null, spread: null, closeTime: null, lastUpdatedAt: null, stale: true });
  }
}
