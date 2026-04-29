import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

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
      liquidity: null,
      source: market?.source ?? source,
      provenance: { source: market?.source ?? source, upstream: "external_trade_ticks" },
    })).reverse();

    return NextResponse.json({ source, externalId, history });
  } catch (error) {
    console.warn("external market history unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, history: [] });
  }
}
