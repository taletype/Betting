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
    const history = (market?.recentTrades ?? []).map((trade) => ({
      timestamp: trade.tradedAt,
      outcome: trade.externalOutcomeId,
      price: trade.price,
      volume: trade.size,
      liquidity: market?.liquidity ?? market?.volumeTotal ?? null,
      source: market?.source ?? source,
      provenance: { source: market?.source ?? source, upstream: "external_trade_ticks" },
    })).reverse();

    if (history.length === 0 && market) {
      const timestamp = market.lastUpdatedAt ?? market.lastSyncedAt ?? market.updatedAt;
      const price = market.lastTradePrice ?? market.outcomes.find((outcome) => outcome.lastPrice !== null)?.lastPrice ?? null;
      const liquidity = market.liquidity ?? market.volumeTotal ?? null;
      if (price !== null || liquidity !== null || market.volume24h !== null) {
        history.push({
          timestamp,
          outcome: null,
          price,
          volume: market.volume24h,
          liquidity,
          source: market.source,
          provenance: { source: market.source, upstream: "external_markets" },
        });
      }
    }

    return NextResponse.json({ source, externalId, history });
  } catch (error) {
    console.warn("external market history unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, history: [] });
  }
}
