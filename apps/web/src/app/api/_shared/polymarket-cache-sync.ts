import {
  fetchAllPolymarketGammaEventMarkets,
  fetchPolymarketGammaEventMarkets,
  type PolymarketGammaRecord,
} from "@bet/integrations";

import {
  createMarketSyncRun,
  finishMarketSyncRun,
  upsertExternalMarketsCache,
} from "./external-market-cache";

type SupabaseLike = {
  from: (table: string) => unknown;
};

export interface PolymarketCacheSyncResult {
  ok: boolean;
  status: "success" | "partial" | "failure" | "skipped";
  marketsSeen: number;
  marketsUpserted: number;
  runId: string | null;
  error?: string;
  syncMode: PolymarketCacheSyncMode;
  pagesFetched?: number;
  rawRecordsSeen?: number;
  uniqueMarkets?: number;
  maxPagesReached?: boolean;
  maxMarketsReached?: boolean;
}

export type PolymarketCacheSyncMode =
  | "smart"
  | "all_open"
  | "archive_closed"
  | "all";

export interface SyncPolymarketMarketCacheOptions {
  limit?: number;
  syncKind?: string;
  staleMs?: number;
  mode?: PolymarketCacheSyncMode;
  pageSize?: number;
  maxPages?: number;
  maxMarkets?: number;
}

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Polymarket cache sync failed";

interface FetchModeResult {
  records: PolymarketGammaRecord[];
  pagesFetched: number;
  rawRecordsSeen: number;
  uniqueMarkets: number;
  maxPagesReached: boolean;
  maxMarketsReached: boolean;
  staleAfter: string;
}

const defaultStaleMs = (mode: PolymarketCacheSyncMode): number => {
  if (mode === "smart") return 60_000;
  if (mode === "archive_closed") return 12 * 60 * 60 * 1000;
  return 5 * 60_000;
};

const getSyncKind = (mode: PolymarketCacheSyncMode, syncKind?: string): string =>
  syncKind ?? (mode === "smart" ? "market_list" : `market_list_${mode}`);

const fetchForMode = async (
  mode: Exclude<PolymarketCacheSyncMode, "all">,
  options: SyncPolymarketMarketCacheOptions,
): Promise<FetchModeResult> => {
  const staleAfter = new Date(Date.now() + (options.staleMs ?? defaultStaleMs(mode))).toISOString();

  if (mode === "smart") {
    const records = await fetchPolymarketGammaEventMarkets({ limit: options.limit ?? 100 });
    return {
      records,
      pagesFetched: 1,
      rawRecordsSeen: records.length,
      uniqueMarkets: new Set(records.map((record) => record.market.externalId)).size,
      maxPagesReached: false,
      maxMarketsReached: false,
      staleAfter,
    };
  }

  const result = await fetchAllPolymarketGammaEventMarkets({
    pageSize: options.pageSize ?? 100,
    maxPages: options.maxPages ?? 50,
    maxMarkets: options.maxMarkets ?? 5_000,
    active: mode === "archive_closed" ? false : true,
    closed: mode === "archive_closed" ? true : false,
    order: mode === "archive_closed" ? "volume" : "volume_24hr",
    ascending: false,
  });

  return {
    ...result,
    staleAfter,
  };
};

const dedupeRecords = (results: FetchModeResult[]): Array<{ record: PolymarketGammaRecord; staleAfter: string }> => {
  const seen = new Set<string>();
  const deduped: Array<{ record: PolymarketGammaRecord; staleAfter: string }> = [];

  for (const result of results) {
    for (const record of result.records) {
      if (seen.has(record.market.externalId)) continue;
      seen.add(record.market.externalId);
      deduped.push({ record, staleAfter: result.staleAfter });
    }
  }

  return deduped;
};

export async function syncPolymarketMarketCache(
  supabase: SupabaseLike,
  options: SyncPolymarketMarketCacheOptions = {},
): Promise<PolymarketCacheSyncResult> {
  const syncMode = options.mode ?? "smart";
  const syncKind = getSyncKind(syncMode, options.syncKind);
  const runId = await createMarketSyncRun(supabase, syncKind);
  if (!runId) {
    return { ok: true, status: "skipped", marketsSeen: 0, marketsUpserted: 0, runId: null, syncMode };
  }

  try {
    const results: FetchModeResult[] = [];
    let archiveError: string | null = null;

    if (syncMode === "all") {
      results.push(await fetchForMode("all_open", options));
      try {
        results.push(await fetchForMode("archive_closed", options));
      } catch (error) {
        archiveError = safeErrorMessage(error);
      }
    } else {
      results.push(await fetchForMode(syncMode, options));
    }

    const deduped = dedupeRecords(results);
    const marketsUpserted = await upsertExternalMarketsCache(
      supabase,
      deduped.map(({ record, staleAfter }) => ({
        market: record.market,
        rawJson: record.rawJson,
        sourceProvenance: {
          ...record.provenance,
          cacheWriter: "web-sync-polymarket",
          fetchedVia: "public-gamma-events-paginated",
          syncMode,
        },
        staleAfter,
      })),
    );
    const pagesFetched = results.reduce((sum, result) => sum + result.pagesFetched, 0);
    const rawRecordsSeen = results.reduce((sum, result) => sum + result.rawRecordsSeen, 0);
    const uniqueMarkets = deduped.length;
    const maxPagesReached = results.some((result) => result.maxPagesReached);
    const maxMarketsReached = results.some((result) => result.maxMarketsReached);
    const status = archiveError ? "partial" : "success";

    await finishMarketSyncRun(supabase, runId, {
      status,
      marketsSeen: uniqueMarkets,
      marketsUpserted,
      errorMessage: archiveError,
      diagnostics: {
        syncMode,
        upstream: "gamma-api.polymarket.com",
        fetchedVia: "public-gamma-events-paginated",
        pagesFetched,
        rawRecordsSeen,
        uniqueMarkets,
        maxPagesReached,
        maxMarketsReached,
        archiveClosedAttempted: syncMode === "all",
        archiveClosedError: archiveError,
        clobReadEnabled: false,
        privateTradingEndpointsUsed: false,
      },
    });

    return {
      ok: true,
      status,
      marketsSeen: uniqueMarkets,
      marketsUpserted,
      runId,
      error: archiveError ?? undefined,
      syncMode,
      pagesFetched,
      rawRecordsSeen,
      uniqueMarkets,
      maxPagesReached,
      maxMarketsReached,
    };
  } catch (error) {
    await finishMarketSyncRun(supabase, runId, {
      status: "failure",
      errorMessage: safeErrorMessage(error),
      diagnostics: {
        syncMode,
        upstream: "gamma-api.polymarket.com",
        fetchedVia: "public-gamma-events-paginated",
        clobReadEnabled: false,
        privateTradingEndpointsUsed: false,
      },
    }).catch(() => undefined);
    return {
      ok: false,
      status: "failure",
      marketsSeen: 0,
      marketsUpserted: 0,
      runId,
      error: safeErrorMessage(error),
      syncMode,
    };
  }
}
