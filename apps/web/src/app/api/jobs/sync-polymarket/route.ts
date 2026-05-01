import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import { syncPolymarketMarketCache } from "../../_shared/polymarket-cache-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET() {
  const result = await syncPolymarketMarketCache(createSupabaseAdminClient(), {
    mode: "all_open",
    syncKind: "market_list_all_open",
    pageSize: 100,
    maxPages: 50,
    maxMarkets: 5_000,
    staleMs: 5 * 60_000,
  });

  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    marketsSeen: result.marketsSeen,
    marketsUpserted: result.marketsUpserted,
    runId: result.runId,
    syncMode: result.syncMode,
    pagesFetched: result.pagesFetched,
    rawRecordsSeen: result.rawRecordsSeen,
    uniqueMarkets: result.uniqueMarkets,
    maxPagesReached: result.maxPagesReached,
    maxMarketsReached: result.maxMarketsReached,
    error: result.error ? "SYNC_FAILED" : undefined,
  }, { status: result.ok ? 200 : 500 });
}
