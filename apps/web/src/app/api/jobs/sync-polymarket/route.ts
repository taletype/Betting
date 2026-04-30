import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import { syncPolymarketMarketCache } from "../../_shared/polymarket-cache-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET() {
  const result = await syncPolymarketMarketCache(createSupabaseAdminClient(), {
    limit: 100,
    syncKind: "market_list",
    staleMs: 60_000,
  });

  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    marketsSeen: result.marketsSeen,
    marketsUpserted: result.marketsUpserted,
    runId: result.runId,
    error: result.error ? "SYNC_FAILED" : undefined,
  }, { status: result.ok ? 200 : 500 });
}
