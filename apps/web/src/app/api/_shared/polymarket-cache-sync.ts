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
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  startOffset?: number;
  nextOffset?: number | null;
  completed?: boolean;
  privateTradingEndpointsUsed?: false;
  upstream?: "gamma-api.polymarket.com";
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
  offset?: number;
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
  startOffset: number;
  nextOffset: number | null;
  staleAfter: string;
}

const readRawRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const readBooleanFlag = (record: Record<string, unknown>, ...keys: string[]): boolean | null => {
  let sawFalse = false;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      if (value) return true;
      sawFalse = true;
      continue;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") sawFalse = true;
    }
  }
  return sawFalse ? false : null;
};

const getStatusFlags = (rawJson: unknown): Record<string, unknown> => {
  const raw = readRawRecord(rawJson);
  const candidateMarket = Array.isArray(raw.markets) && raw.markets[0] && typeof raw.markets[0] === "object"
    ? raw.markets[0] as Record<string, unknown>
    : raw;
  return {
    active: readBooleanFlag(candidateMarket, "active") ?? readBooleanFlag(raw, "active"),
    closed: readBooleanFlag(candidateMarket, "closed") ?? readBooleanFlag(raw, "closed"),
    archived: readBooleanFlag(candidateMarket, "archived") ?? readBooleanFlag(raw, "archived"),
    cancelled: readBooleanFlag(candidateMarket, "cancelled", "canceled") ?? readBooleanFlag(raw, "cancelled", "canceled"),
    acceptingOrders: readBooleanFlag(candidateMarket, "accepting_orders", "acceptingOrders") ?? readBooleanFlag(raw, "accepting_orders", "acceptingOrders"),
    enableOrderBook: readBooleanFlag(candidateMarket, "enable_order_book", "enableOrderBook", "orderBookEnabled") ?? readBooleanFlag(raw, "enable_order_book", "enableOrderBook", "orderBookEnabled"),
    restricted: readBooleanFlag(candidateMarket, "restricted") ?? readBooleanFlag(raw, "restricted"),
    endDate: typeof candidateMarket.endDate === "string" ? candidateMarket.endDate : typeof raw.endDate === "string" ? raw.endDate : null,
    endDateIso: typeof candidateMarket.end_date_iso === "string" ? candidateMarket.end_date_iso : typeof raw.end_date_iso === "string" ? raw.end_date_iso : null,
  };
};

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
      startOffset: 0,
      nextOffset: null,
      staleAfter,
    };
  }

  const result = await fetchAllPolymarketGammaEventMarkets({
    pageSize: options.pageSize ?? 100,
    offset: options.offset ?? 0,
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
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
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
          statusFlags: getStatusFlags(record.rawJson),
        },
        staleAfter,
      })),
    );
    const pagesFetched = results.reduce((sum, result) => sum + result.pagesFetched, 0);
    const rawRecordsSeen = results.reduce((sum, result) => sum + result.rawRecordsSeen, 0);
    const uniqueMarkets = deduped.length;
    const maxPagesReached = results.some((result) => result.maxPagesReached);
    const maxMarketsReached = results.some((result) => result.maxMarketsReached);
    const startOffset = results.reduce((min, result) => Math.min(min, result.startOffset), Number.MAX_SAFE_INTEGER);
    const nextOffset = syncMode === "all" ? null : results[0]?.nextOffset ?? null;
    const completed = !maxPagesReached && !maxMarketsReached && nextOffset === null;
    const status = archiveError ? "partial" : "success";
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAtMs;

    await finishMarketSyncRun(supabase, runId, {
      status,
      marketsSeen: uniqueMarkets,
      marketsUpserted,
      errorMessage: archiveError,
      diagnostics: {
        syncMode,
        startedAt,
        finishedAt,
        durationMs,
        upstream: "gamma-api.polymarket.com",
        fetchedVia: "public-gamma-events-paginated",
        pagesFetched,
        rawRecordsSeen,
        uniqueMarkets,
        marketsUpserted,
        startOffset: Number.isFinite(startOffset) ? startOffset : 0,
        nextOffset,
        maxPagesReached,
        maxMarketsReached,
        completed,
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
      startedAt,
      finishedAt,
      durationMs,
      startOffset: Number.isFinite(startOffset) ? startOffset : 0,
      nextOffset,
      completed,
      privateTradingEndpointsUsed: false,
      upstream: "gamma-api.polymarket.com",
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAtMs;
    await finishMarketSyncRun(supabase, runId, {
      status: "failure",
      errorMessage: safeErrorMessage(error),
      diagnostics: {
        syncMode,
        startedAt,
        finishedAt,
        durationMs,
        upstream: "gamma-api.polymarket.com",
        fetchedVia: "public-gamma-events-paginated",
        startOffset: options.offset ?? 0,
        nextOffset: options.offset ?? 0,
        completed: false,
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
      startedAt,
      finishedAt,
      durationMs,
      startOffset: options.offset ?? 0,
      nextOffset: options.offset ?? 0,
      completed: false,
      privateTradingEndpointsUsed: false,
      upstream: "gamma-api.polymarket.com",
    };
  }
}
