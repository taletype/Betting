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

type SupabaseLike = {
  from: (table: string) => unknown;
};

type CacheSource = "polymarket";

interface ExternalMarketCacheRow {
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

export async function readExternalMarketsFromCache(supabase: SupabaseLike): Promise<ExternalMarketCacheReadResult> {
  const diagnostics = baseDiagnostics();
  const { data, error } = await (supabase.from("external_market_cache") as {
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
    .limit(500);

  if (error) {
    diagnostics.errorCode = "SUPABASE_CACHE_READ_FAILED";
    throw error;
  }

  const rows = data ?? [];
  const now = Date.now();
  const markets = normalizeApiPayload(rows.map(mapCacheRow)) as PublicExternalMarketRecord[];
  mergeCachedPriceHistory(markets, await readCachedPriceRows(supabase, markets));
  diagnostics.supabaseCacheReachable = true;
  diagnostics.marketCacheRowCount = rows.length;
  diagnostics.newestLastSyncedAt = rows.map((row) => row.last_synced_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  diagnostics.staleMarketCount = rows.filter((row) => !row.stale_after || new Date(row.stale_after).getTime() <= now).length;
  diagnostics.lastSyncStatus = await readLastSyncStatus(supabase);

  return {
    markets,
    stale: rows.length > 0 && rows.some((row) => !row.stale_after || new Date(row.stale_after).getTime() <= now),
    lastUpdatedAt: diagnostics.newestLastSyncedAt,
    diagnostics,
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
