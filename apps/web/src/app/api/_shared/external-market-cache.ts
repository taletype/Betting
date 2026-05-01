import type { NormalizedExternalMarket } from "@bet/integrations";
import { resolvePolymarketMarketStatus } from "@bet/integrations";

import { normalizeApiPayload } from "./api-serialization";
import {
  normalizeLiquidityHistory,
  normalizePriceHistory,
  normalizeRecentTrades,
  normalizeVolumeHistory,
} from "./chart-history";
import type { PublicExternalMarketRecord } from "./polymarket-gamma-fallback";
import { getMarketQualityScore } from "../../../lib/external-market-ranking";

type SupabaseLike = {
  from: (table: string) => unknown;
};

type CacheSource = "polymarket";

export interface ExternalMarketCacheRow {
  id: string;
  source: CacheSource;
  external_id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  outcomes: unknown;
  prices: unknown;
  best_bid: string | number | null;
  best_ask: string | number | null;
  volume: string | number | null;
  liquidity: string | number | null;
  close_time: string | null;
  resolution_status: string | null;
  polymarket_url: string | null;
  image_url: string | null;
  icon_url: string | null;
  image_source_url: string | null;
  image_updated_at: string | null;
  raw_json: unknown;
  source_provenance: unknown;
  first_seen_at: string;
  last_seen_at: string;
  last_synced_at: string | null;
  stale_after: string | null;
  is_active: boolean;
  is_tradable: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ExternalMarketLookupRow {
  id: string;
  external_id: string;
}

interface ExternalMarketPriceRow {
  market_id: string;
  source: "polymarket";
  observed_at: string;
  outcome_prices: unknown;
  last_trade_price: string | number | null;
  volume: string | number | null;
  liquidity: string | number | null;
  source_provenance?: unknown;
}

export interface ExternalMarketCacheDiagnostics {
  supabaseCacheReachable: boolean;
  marketCacheRowCount: number | null;
  newestLastSyncedAt: string | null;
  staleMarketCount: number | null;
  lastSyncStatus: string | null;
  fallbackUsedLastRequest: boolean;
  routedTradingEnabled: boolean;
  builderCodeConfigured: boolean;
  errorCode?: string;
}

export interface ExternalMarketCacheReadResult {
  markets: PublicExternalMarketRecord[];
  stale: boolean;
  lastUpdatedAt: string | null;
  diagnostics: ExternalMarketCacheDiagnostics;
  pagination: {
    limit: number;
    offset: number;
    nextOffset: number | null;
    returnedCount: number;
    totalCount: number | null;
  };
}

export interface ExternalMarketCacheReadOptions {
  view?: "smart" | "all";
  status?: "open" | "closed" | "resolved" | "cancelled" | "all";
  q?: string | null;
  sort?: "trending" | "volume" | "liquidity" | "latest" | "close" | "quality";
  limit?: number;
  offset?: number;
}

export interface ExternalMarketCacheUpsertInput {
  market: NormalizedExternalMarket;
  rawJson: unknown;
  sourceProvenance: unknown;
  staleAfter?: string;
}

const CACHE_COLUMNS = [
  "id",
  "source",
  "external_id",
  "slug",
  "title",
  "description",
  "category",
  "outcomes",
  "prices",
  "best_bid",
  "best_ask",
  "volume",
  "liquidity",
  "close_time",
  "resolution_status",
  "polymarket_url",
  "image_url",
  "icon_url",
  "image_source_url",
  "image_updated_at",
  "raw_json",
  "source_provenance",
  "first_seen_at",
  "last_seen_at",
  "last_synced_at",
  "stale_after",
  "is_active",
  "is_tradable",
  "created_at",
  "updated_at",
].join(", ");

const toNumber = (value: string | number | null): number | null => {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readNumber = (value: unknown): number | null =>
  typeof value === "string" || typeof value === "number" ? toNumber(value) : null;

// Safe while full active sync remains capped at maxMarkets <= 5_000.
// If archive sync grows cached rows beyond 10_000, move filtering/sorting DB-side.
const CACHE_READ_ROW_WINDOW = 10_000;
const DEFAULT_CACHE_READ_LIMIT = 100;
const MAX_CACHE_READ_LIMIT = 250;

export const normalizeCacheReadLimit = (limit: number | null | undefined, _view: ExternalMarketCacheReadOptions["view"] = "smart"): number => {
  const parsed = typeof limit === "number" ? limit : Number(limit ?? DEFAULT_CACHE_READ_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_READ_LIMIT;
  return Math.min(MAX_CACHE_READ_LIMIT, Math.max(1, Math.trunc(parsed)));
};

export const normalizeCacheReadOffset = (offset: number | null | undefined): number => {
  const parsed = typeof offset === "number" ? offset : Number(offset ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
};

const readJsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const hasCachedMarketActivity = (row: ExternalMarketCacheRow): boolean =>
  (toNumber(row.volume) ?? 0) > 0 || (toNumber(row.liquidity) ?? 0) > 0;

export const hasCachedMarketPriceData = (row: ExternalMarketCacheRow): boolean => {
  const prices = readJsonObject(row.prices);
  const directPrices = [row.best_bid, row.best_ask, prices.bestBid, prices.bestAsk, prices.lastTradePrice];
  if (directPrices.some((value) => {
    const parsed = readNumber(value);
    return parsed !== null && parsed > 0;
  })) {
    return true;
  }

  return Array.isArray(row.outcomes) && row.outcomes.some((outcome) => {
    const record = readJsonObject(outcome);
    return [record.bestBid, record.bestAsk, record.lastPrice].some((value) => {
      const parsed = readNumber(value);
      return parsed !== null && parsed > 0;
    });
  });
};

export const isCachedMarketStale = (row: ExternalMarketCacheRow): boolean =>
  !row.stale_after || new Date(row.stale_after).getTime() <= Date.now();

const toStatus = (row: ExternalMarketCacheRow): PublicExternalMarketRecord["status"] => {
  return resolvePolymarketMarketStatus({
    active: row.is_active,
    closed: row.resolution_status === "closed",
    status: row.resolution_status ?? undefined,
    closeTime: row.close_time ?? undefined,
    endDate: row.close_time ?? undefined,
  });
};

const mapOutcome = (outcome: unknown, index: number): PublicExternalMarketRecord["outcomes"][number] => {
  const record = outcome && typeof outcome === "object" ? outcome as Record<string, unknown> : {};
  const title = typeof record.title === "string" ? record.title : `Outcome ${index + 1}`;
  const yesNo = record.yesNo === "yes" || record.yesNo === "no" ? record.yesNo : null;
  return {
    externalOutcomeId: String(record.externalOutcomeId ?? record.external_outcome_id ?? index),
    title,
    slug: typeof record.slug === "string" ? record.slug : title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    index: typeof record.index === "number" ? record.index : typeof record.outcomeIndex === "number" ? record.outcomeIndex : index,
    yesNo,
    bestBid: readNumber(record.bestBid),
    bestAsk: readNumber(record.bestAsk),
    lastPrice: readNumber(record.lastPrice),
    volume: readNumber(record.volume),
  };
};

const mapCacheRow = (row: ExternalMarketCacheRow): PublicExternalMarketRecord => {
  const outcomes = Array.isArray(row.outcomes) ? row.outcomes.map(mapOutcome) : [];
  const lastUpdatedAt = row.last_synced_at ?? row.last_seen_at ?? row.updated_at ?? row.first_seen_at;
  const stale = row.stale_after ? new Date(row.stale_after).getTime() <= Date.now() : true;
  const sourceProvenance = {
    ...(row.source_provenance && typeof row.source_provenance === "object" ? row.source_provenance as Record<string, unknown> : {}),
    dataPath: "supabase_cache",
    stale,
    staleAfter: row.stale_after,
  };
  const rawRecord = row.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  const priceHistory = normalizePriceHistory(rawRecord, "cache", 50);
  const volumeHistory = normalizeVolumeHistory(rawRecord, "cache", 50);
  const liquidityHistory = normalizeLiquidityHistory(rawRecord, "cache", 50);
  const normalizedRecentTrades = normalizeRecentTrades(rawRecord, "cache", 50);
  const chartUpdatedAt = [
    priceHistory.at(-1)?.timestamp,
    volumeHistory.at(-1)?.timestamp,
    liquidityHistory.at(-1)?.timestamp,
    normalizedRecentTrades.at(-1)?.timestamp,
  ].filter(Boolean).sort().at(-1);

  return {
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    slug: row.slug,
    title: row.title,
    question: row.title,
    description: row.description ?? "",
    status: toStatus(row),
    marketUrl: row.polymarket_url,
    imageUrl: row.image_url,
    iconUrl: row.icon_url,
    imageSourceUrl: row.image_source_url,
    imageUpdatedAt: row.image_updated_at,
    closeTime: row.close_time,
    endTime: row.close_time,
    resolvedAt: row.resolution_status === "resolved" ? row.last_seen_at : null,
    bestBid: toNumber(row.best_bid),
    bestAsk: toNumber(row.best_ask),
    lastTradePrice: outcomes.find((outcome) => outcome.yesNo === "yes")?.lastPrice ?? null,
    volume24h: toNumber(row.volume),
    volumeTotal: toNumber(row.volume),
    liquidity: toNumber(row.liquidity),
    provenance: sourceProvenance,
    sourceProvenance,
    lastSyncedAt: row.last_synced_at,
    lastUpdatedAt,
    createdAt: row.first_seen_at,
    updatedAt: row.updated_at ?? lastUpdatedAt,
    outcomes,
    recentTrades: [],
    ...(priceHistory.length ? { priceHistory } : {}),
    ...(volumeHistory.length ? { volumeHistory } : {}),
    ...(liquidityHistory.length ? { liquidityHistory } : {}),
    ...(normalizedRecentTrades.length ? { normalizedRecentTrades } : {}),
    ...(chartUpdatedAt ? { chartUpdatedAt, chartSource: "cache" } : {}),
    spread: toNumber(row.best_bid) !== null && toNumber(row.best_ask) !== null
      ? Math.max(0, toNumber(row.best_ask)! - toNumber(row.best_bid)!)
      : null,
    latestOrderbook: [],
  };
};

export const getCachedMarketQualityScore = (row: ExternalMarketCacheRow): number =>
  getMarketQualityScore(mapCacheRow(row));

const baseDiagnostics = (): ExternalMarketCacheDiagnostics => ({
  supabaseCacheReachable: false,
  marketCacheRowCount: null,
  newestLastSyncedAt: null,
  staleMarketCount: null,
  lastSyncStatus: null,
  fallbackUsedLastRequest: false,
  routedTradingEnabled: process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true",
  builderCodeConfigured: Boolean(process.env.POLY_BUILDER_CODE?.trim() || process.env.POLYMARKET_BUILDER_CODE?.trim()),
});

const readLastSyncStatus = async (supabase: SupabaseLike): Promise<string | null> => {
  try {
    const result = await (supabase.from("external_market_sync_runs") as {
      select: (columns: string) => { eq: (column: string, value: string) => { order: (column: string, options?: Record<string, unknown>) => { limit: (count: number) => Promise<{ data: Array<{ status: string }> | null; error: Error | null }> } } };
    })
      .select("status")
      .eq("source", "polymarket")
      .order("started_at", { ascending: false })
      .limit(1);
    return result.error ? null : result.data?.[0]?.status ?? null;
  } catch {
    return null;
  }
};

const readCachedPriceRows = async (
  supabase: SupabaseLike,
  markets: PublicExternalMarketRecord[],
): Promise<Map<string, ExternalMarketPriceRow[]>> => {
  try {
    const externalIds = markets.map((market) => market.externalId);
    if (externalIds.length === 0) return new Map();

    const marketResult = await (supabase.from("external_markets") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => Promise<{ data: ExternalMarketLookupRow[] | null; error: Error | null }>;
        };
      };
    })
      .select("id, external_id")
      .eq("source", "polymarket")
      .in("external_id", externalIds);

    if (marketResult.error || !marketResult.data?.length) return new Map();

    const externalIdByMarketId = new Map(marketResult.data.map((row) => [row.id, row.external_id]));
    const priceResult = await (supabase.from("external_market_prices") as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => {
          order: (column: string, options?: Record<string, unknown>) => {
            limit: (count: number) => Promise<{ data: ExternalMarketPriceRow[] | null; error: Error | null }>;
          };
        };
      };
    })
      .select("market_id, source, observed_at, outcome_prices, last_trade_price, volume, liquidity, source_provenance")
      .in("market_id", [...externalIdByMarketId.keys()])
      .order("observed_at", { ascending: false })
      .limit(externalIds.length * 100);

    if (priceResult.error) return new Map();

    const byExternalId = new Map<string, ExternalMarketPriceRow[]>();
    for (const row of priceResult.data ?? []) {
      const externalId = externalIdByMarketId.get(row.market_id);
      if (!externalId) continue;
      const rows = byExternalId.get(externalId) ?? [];
      rows.push(row);
      byExternalId.set(externalId, rows);
    }
    return byExternalId;
  } catch (error) {
    console.warn("external_market_prices read failed; continuing without cached chart history", error);
    return new Map();
  }
};

const mergeCachedPriceHistory = (
  markets: PublicExternalMarketRecord[],
  priceRowsByExternalId: Map<string, ExternalMarketPriceRow[]>,
): void => {
  for (const market of markets) {
    const rows = priceRowsByExternalId.get(market.externalId) ?? [];
    if (rows.length === 0) continue;

    const rawRows = rows.map((row) => ({
      timestamp: row.observed_at,
      outcomePrices: row.outcome_prices,
      lastTradePrice: row.last_trade_price,
      volume: row.volume,
      liquidity: row.liquidity,
      source: "cache",
    }));
    const priceHistory = normalizePriceHistory(rawRows, "cache", 50);
    const volumeHistory = normalizeVolumeHistory(rawRows, "cache", 50);
    const liquidityHistory = normalizeLiquidityHistory(rawRows, "cache", 50);
    if (priceHistory.length > 0) market.priceHistory = priceHistory;
    if (volumeHistory.length > 0) market.volumeHistory = volumeHistory;
    if (liquidityHistory.length > 0) market.liquidityHistory = liquidityHistory;

    const chartUpdatedAt = [
      market.chartUpdatedAt,
      priceHistory.at(-1)?.timestamp,
      volumeHistory.at(-1)?.timestamp,
      liquidityHistory.at(-1)?.timestamp,
    ].filter(Boolean).sort().at(-1);
    if (chartUpdatedAt) {
      market.chartUpdatedAt = chartUpdatedAt;
      market.chartSource = "cache";
    }
  }
};

const normalizeCacheView = (view: ExternalMarketCacheReadOptions["view"]): "smart" | "all" =>
  view === "all" ? "all" : "smart";

const normalizeCacheStatus = (status: ExternalMarketCacheReadOptions["status"]): NonNullable<ExternalMarketCacheReadOptions["status"]> =>
  status === "closed" || status === "resolved" || status === "cancelled" || status === "all" ? status : "open";

const normalizeCacheSort = (sort: ExternalMarketCacheReadOptions["sort"]): NonNullable<ExternalMarketCacheReadOptions["sort"]> =>
  sort === "volume" || sort === "liquidity" || sort === "latest" || sort === "close" || sort === "quality" ? sort : "trending";

const searchText = (row: ExternalMarketCacheRow): string =>
  [row.title, row.slug, row.external_id, row.description ?? ""].join(" ").toLowerCase();

const matchesStatus = (row: ExternalMarketCacheRow, statusFilter: NonNullable<ExternalMarketCacheReadOptions["status"]>): boolean => {
  const status = toStatus(row);
  if (statusFilter === "all") return true;
  if (statusFilter === "closed") return status === "closed" || status === "resolved" || status === "cancelled";
  return status === statusFilter;
};

const isSmartEligibleCacheRow = (row: ExternalMarketCacheRow): boolean =>
  toStatus(row) === "open" &&
  hasCachedMarketActivity(row) &&
  hasCachedMarketPriceData(row) &&
  !isCachedMarketStale(row);

const sortMappedMarkets = (
  items: Array<{ row: ExternalMarketCacheRow; market: PublicExternalMarketRecord; index: number }>,
  sort: NonNullable<ExternalMarketCacheReadOptions["sort"]>,
): void => {
  items.sort((a, b) => {
    const openDelta = (b.market.status === "open" ? 1 : 0) - (a.market.status === "open" ? 1 : 0);
    if (openDelta !== 0 && (sort === "trending" || sort === "quality")) return openDelta;

    if (sort === "volume") {
      const delta = (b.market.volume24h ?? b.market.volumeTotal ?? 0) - (a.market.volume24h ?? a.market.volumeTotal ?? 0);
      if (delta !== 0) return delta;
    }

    if (sort === "liquidity") {
      const delta = (b.market.liquidity ?? b.market.volumeTotal ?? 0) - (a.market.liquidity ?? a.market.volumeTotal ?? 0);
      if (delta !== 0) return delta;
    }

    if (sort === "latest") {
      const delta = (new Date(b.market.lastSyncedAt ?? b.market.updatedAt).getTime() || 0) - (new Date(a.market.lastSyncedAt ?? a.market.updatedAt).getTime() || 0);
      if (delta !== 0) return delta;
    }

    if (sort === "close") {
      const aTime = a.market.closeTime ? new Date(a.market.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.market.closeTime ? new Date(b.market.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
    }

    const qualityDelta = getMarketQualityScore(b.market) - getMarketQualityScore(a.market);
    if (qualityDelta !== 0) return qualityDelta;

    const volumeDelta = (b.market.volume24h ?? b.market.volumeTotal ?? 0) - (a.market.volume24h ?? a.market.volumeTotal ?? 0);
    if (volumeDelta !== 0) return volumeDelta;

    const liquidityDelta = (b.market.liquidity ?? b.market.volumeTotal ?? 0) - (a.market.liquidity ?? a.market.volumeTotal ?? 0);
    if (liquidityDelta !== 0) return liquidityDelta;

    return a.index - b.index;
  });
};

export async function readExternalMarketsFromCache(
  supabase: SupabaseLike,
  options: ExternalMarketCacheReadOptions = {},
): Promise<ExternalMarketCacheReadResult> {
  const diagnostics = baseDiagnostics();
  const view = normalizeCacheView(options.view);
  const status = normalizeCacheStatus(options.status);
  const sort = normalizeCacheSort(options.sort);
  const limit = normalizeCacheReadLimit(options.limit, view);
  const offset = normalizeCacheReadOffset(options.offset);
  const q = options.q?.trim().toLowerCase() ?? "";
  const { data, error, count } = await (supabase.from("external_market_cache") as {
    select: (columns: string, options?: Record<string, unknown>) => {
      eq: (column: string, value: boolean | string) => {
        order: (column: string, options?: Record<string, unknown>) => {
          order: (column: string, options?: Record<string, unknown>) => {
            limit: (count: number) => Promise<{ data: ExternalMarketCacheRow[] | null; error: Error | null; count?: number | null }>;
          };
        };
      };
    };
  })
    .select(CACHE_COLUMNS, { count: "exact" })
    .eq("source", "polymarket")
    .order("volume", { ascending: false, nullsFirst: false })
    .order("close_time", { ascending: true, nullsFirst: false })
    .limit(CACHE_READ_ROW_WINDOW);

  if (error) {
    diagnostics.errorCode = "SUPABASE_CACHE_READ_FAILED";
    throw error;
  }

  const rows = data ?? [];
  const now = Date.now();
  const filteredRows = rows.filter((row) => {
    if (!matchesStatus(row, status)) return false;
    if (q && !searchText(row).includes(q)) return false;
    if (view === "smart" && !isSmartEligibleCacheRow(row)) return false;
    return true;
  });
  const mapped = filteredRows.map((row, index) => ({ row, market: mapCacheRow(row), index }));
  sortMappedMarkets(mapped, sort);
  const page = mapped.slice(offset, offset + limit);
  const markets = normalizeApiPayload(page.map((item) => item.market)) as PublicExternalMarketRecord[];
  mergeCachedPriceHistory(markets, await readCachedPriceRows(supabase, markets));
  diagnostics.supabaseCacheReachable = true;
  diagnostics.marketCacheRowCount = count ?? rows.length;
  diagnostics.newestLastSyncedAt = rows.map((row) => row.last_synced_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  diagnostics.staleMarketCount = rows.filter((row) => !row.stale_after || new Date(row.stale_after).getTime() <= now).length;
  diagnostics.lastSyncStatus = await readLastSyncStatus(supabase);
  const totalCount = filteredRows.length;

  return {
    markets,
    stale: page.length > 0 && page.some((item) => isCachedMarketStale(item.row)),
    lastUpdatedAt: diagnostics.newestLastSyncedAt,
    diagnostics,
    pagination: {
      limit,
      offset,
      nextOffset: offset + markets.length < totalCount ? offset + limit : null,
      returnedCount: markets.length,
      totalCount,
    },
  };
}

export async function readExternalMarketBySlugFromCache(supabase: SupabaseLike, slug: string): Promise<PublicExternalMarketRecord | null> {
  const { data, error } = await (supabase.from("external_market_cache") as {
    select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: ExternalMarketCacheRow | null; error: Error | null }> } };
  }).select(CACHE_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const market = mapCacheRow(data);
  mergeCachedPriceHistory([market], await readCachedPriceRows(supabase, [market]));
  return market;
}

export async function readExternalMarketByIdFromCache(supabase: SupabaseLike, externalId: string): Promise<PublicExternalMarketRecord | null> {
  const { data, error } = await (supabase.from("external_market_cache") as {
    select: (columns: string) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: ExternalMarketCacheRow | null; error: Error | null }> } } };
  }).select(CACHE_COLUMNS).eq("source", "polymarket").eq("external_id", externalId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const market = mapCacheRow(data);
  mergeCachedPriceHistory([market], await readCachedPriceRows(supabase, [market]));
  return market;
}

export async function upsertExternalMarketsCache(supabase: SupabaseLike, inputs: ExternalMarketCacheUpsertInput[]): Promise<number> {
  if (inputs.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = inputs.map(({ market, rawJson, sourceProvenance, staleAfter }) => ({
    source: "polymarket",
    external_id: market.externalId,
    slug: market.slug,
    title: market.title,
    description: market.description,
    category: null,
    outcomes: market.outcomes.map((outcome) => ({
      externalOutcomeId: outcome.externalOutcomeId,
      title: outcome.title,
      slug: outcome.slug,
      index: outcome.outcomeIndex,
      outcomeIndex: outcome.outcomeIndex,
      yesNo: outcome.yesNo,
      bestBid: outcome.bestBid,
      bestAsk: outcome.bestAsk,
      lastPrice: outcome.lastPrice,
      volume: outcome.volume,
    })),
    prices: {
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      lastTradePrice: market.lastTradePrice,
    },
    best_bid: market.bestBid,
    best_ask: market.bestAsk,
    volume: market.volume24h ?? market.volumeTotal,
    liquidity: market.volumeTotal,
    close_time: market.closeTime ?? market.endTime,
    resolution_status: market.status,
    polymarket_url: market.url,
    image_url: market.imageUrl,
    icon_url: market.iconUrl,
    image_source_url: market.imageSourceUrl,
    image_updated_at: market.imageUpdatedAt,
    raw_json: rawJson,
    source_provenance: sourceProvenance,
    last_seen_at: now,
    last_synced_at: now,
    stale_after: staleAfter ?? new Date(Date.now() + 60_000).toISOString(),
    is_active: market.status === "open",
    is_tradable: market.status === "open",
    updated_at: now,
  }));

  const { error } = await (supabase.from("external_market_cache") as {
    upsert: (rows: unknown[], options?: Record<string, unknown>) => Promise<{ error: Error | null }>;
  }).upsert(rows, { onConflict: "source,external_id" });
  if (error) throw error;
  return rows.length;
}

export async function markExternalMarketsStale(supabase: SupabaseLike, source: CacheSource = "polymarket"): Promise<void> {
  const { error } = await (supabase.from("external_market_cache") as {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error: Error | null }> };
  }).update({ stale_after: new Date().toISOString() }).eq("source", source);
  if (error) throw error;
}

export async function createMarketSyncRun(supabase: SupabaseLike, syncKind = "market_list"): Promise<string | null> {
  const { data, error } = await (supabase.from("external_market_sync_runs") as {
    insert: (values: Record<string, unknown>) => { select: (columns: string) => { single: () => Promise<{ data: { id: string } | null; error: Error | null }> } };
  }).insert({ source: "polymarket", sync_kind: syncKind, status: "running" }).select("id").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return null;
    throw error;
  }
  return data?.id ?? null;
}

export async function finishMarketSyncRun(
  supabase: SupabaseLike,
  id: string,
  input: { status: "success" | "partial" | "failure" | "skipped"; marketsSeen?: number; marketsUpserted?: number; errorMessage?: string | null; diagnostics?: unknown },
): Promise<void> {
  const { error } = await (supabase.from("external_market_sync_runs") as {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error: Error | null }> };
  }).update({
    status: input.status,
    finished_at: new Date().toISOString(),
    markets_seen: input.marketsSeen ?? 0,
    markets_upserted: input.marketsUpserted ?? 0,
    error_message: input.errorMessage ?? null,
    diagnostics: input.diagnostics ?? {},
  }).eq("id", id);
  if (error) throw error;
}
