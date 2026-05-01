import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import { verifyCronRequest } from "../../cron/_lib/verify-cron-request";
import { syncPolymarketMarketCache, type PolymarketCacheSyncMode } from "../../_shared/polymarket-cache-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const validModes = new Set<PolymarketCacheSyncMode>(["smart", "all_open", "archive_closed", "all"]);

const readIntegerParam = (searchParams: URLSearchParams, name: string, defaultValue: number, min: number, max: number): number => {
  const raw = searchParams.get(name);
  const parsed = raw === null ? defaultValue : Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

export async function handleSyncPolymarketJob(
  request: Request,
  createAdminClient: typeof createSupabaseAdminClient = createSupabaseAdminClient,
) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const searchParams = new URL(request.url).searchParams;
  const modeParam = searchParams.get("mode") ?? "all_open";
  if (!validModes.has(modeParam as PolymarketCacheSyncMode)) {
    return NextResponse.json({ ok: false, error: "INVALID_SYNC_MODE" }, { status: 400 });
  }

  const mode = modeParam as PolymarketCacheSyncMode;
  const pageSize = readIntegerParam(searchParams, "pageSize", 100, 1, 500);
  const maxPages = readIntegerParam(searchParams, "maxPages", 5, 1, 10);
  const maxMarkets = readIntegerParam(searchParams, "maxMarkets", 1_000, 1, 1_000);
  const offset = readIntegerParam(searchParams, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const result = await syncPolymarketMarketCache(createAdminClient(), {
    mode,
    syncKind: mode === "smart" ? "market_list" : `market_list_${mode}`,
    pageSize,
    maxPages,
    maxMarkets,
    offset,
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
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    startOffset: result.startOffset,
    nextOffset: result.nextOffset,
    maxPagesReached: result.maxPagesReached,
    maxMarketsReached: result.maxMarketsReached,
    completed: result.completed,
    privateTradingEndpointsUsed: result.privateTradingEndpointsUsed,
    upstream: result.upstream,
    error: result.error ? "SYNC_FAILED" : undefined,
  }, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handleSyncPolymarketJob(request);
}
