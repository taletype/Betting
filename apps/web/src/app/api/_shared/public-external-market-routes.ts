import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import {
  readExternalMarketByIdFromCache,
  readExternalMarketBySlugFromCache,
  readExternalMarketsFromCache,
  type ExternalMarketCacheDiagnostics,
} from "./external-market-cache";
import { applyMarketTranslations, resolveMarketLocale } from "./market-translation";
import { readExternalMarketBySourceAndId, readExternalMarkets } from "./external-market-read";
import { readPolymarketGammaFallbackMarkets } from "./polymarket-gamma-fallback";

const getAdminSupabase = () => createSupabaseAdminClient();

type SupabaseAdminFactory = typeof createSupabaseAdminClient;

const publicUnavailableMessage = "Configured market data sources are temporarily unavailable.";

const unavailablePayload = (source: string) => ({
  ok: false,
  error: "MARKET_SOURCE_UNAVAILABLE",
  source,
  message: publicUnavailableMessage,
});

const safeMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Market source unavailable";

type MarketStatusFilter = "open" | "closed" | "resolved" | "cancelled" | "all";

const resolveStatusFilter = (request?: Request): MarketStatusFilter => {
  const raw = request ? new URL(request.url).searchParams.get("status") : null;
  if (raw === "closed" || raw === "resolved" || raw === "cancelled" || raw === "all") return raw;
  return "open";
};

const filterMarketsByStatus = <Market extends { status?: unknown }>(
  markets: Market[],
  status: MarketStatusFilter,
): Market[] => status === "all"
  ? markets
  : markets.filter((market) => market.status === status);

const toTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const isMarketStale = (market: { sourceProvenance?: unknown; provenance?: unknown; lastUpdatedAt?: string; lastSyncedAt?: string | null }): boolean => {
  const provenance = market.sourceProvenance ?? market.provenance;
  const record = provenance && typeof provenance === "object" ? provenance as Record<string, unknown> : {};
  if (record.stale === true) return true;
  const staleAfter = typeof record.staleAfter === "string" ? toTime(record.staleAfter) : null;
  if (staleAfter !== null) return staleAfter <= Date.now();
  const lastUpdatedAt = toTime(market.lastUpdatedAt ?? market.lastSyncedAt ?? null);
  return lastUpdatedAt === null || Date.now() - lastUpdatedAt > 15 * 60 * 1000;
};

const hasFreshOpenMarket = (markets: Array<{ status?: unknown; sourceProvenance?: unknown; provenance?: unknown; lastUpdatedAt?: string; lastSyncedAt?: string | null }>): boolean =>
  markets.some((market) => market.status === "open" && !isMarketStale(market));

const fallbackDiagnostics = (input?: Partial<ExternalMarketCacheDiagnostics>): ExternalMarketCacheDiagnostics => ({
  supabaseCacheReachable: false,
  marketCacheRowCount: null,
  newestLastSyncedAt: null,
  staleMarketCount: null,
  lastSyncStatus: null,
  fallbackUsedLastRequest: false,
  routedTradingEnabled: process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true",
  builderCodeConfigured: Boolean(process.env.POLY_BUILDER_CODE?.trim() || process.env.POLYMARKET_BUILDER_CODE?.trim()),
  ...input,
});

const marketsEnvelope = (input: {
  source: "supabase_cache" | "polymarket_gamma_fallback";
  fallbackUsed: boolean;
  stale: boolean;
  lastUpdatedAt: string | null;
  markets: unknown[];
  diagnostics: ExternalMarketCacheDiagnostics;
}) => ({
  ok: true,
  source: input.source,
  fallbackUsed: input.fallbackUsed,
  stale: input.stale,
  lastUpdatedAt: input.lastUpdatedAt,
  markets: input.markets,
  diagnostics: {
    supabaseCacheReachable: input.diagnostics.supabaseCacheReachable,
    marketCacheRowCount: input.diagnostics.marketCacheRowCount,
    newestLastSyncedAt: input.diagnostics.newestLastSyncedAt,
    staleMarketCount: input.diagnostics.staleMarketCount,
    lastSyncStatus: input.diagnostics.lastSyncStatus,
    fallbackUsedLastRequest: input.fallbackUsed,
    routedTradingEnabled: input.diagnostics.routedTradingEnabled,
    builderCodeConfigured: input.diagnostics.builderCodeConfigured,
    errorCode: input.diagnostics.errorCode,
  },
});

export async function externalMarketsResponse(request?: Request, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const supabase = adminSupabase();
    const url = request ? new URL(request.url) : null;
    const locale = resolveMarketLocale(url?.searchParams.get("locale") ?? null);
    const status = resolveStatusFilter(request);
    const cached = await readExternalMarketsFromCache(supabase);
    if (cached.markets.length > 0) {
      const markets = await applyMarketTranslations(supabase, cached.markets, locale);
      if (status === "open" && !hasFreshOpenMarket(markets)) {
        try {
          const fallbackMarkets = await readPolymarketGammaFallbackMarkets();
          const translatedFallbackMarkets = await applyMarketTranslations(supabase, fallbackMarkets, locale);
          const openFallbackMarkets = filterMarketsByStatus(translatedFallbackMarkets, status);
          if (hasFreshOpenMarket(openFallbackMarkets)) {
            return NextResponse.json(marketsEnvelope({
              source: "polymarket_gamma_fallback",
              fallbackUsed: true,
              stale: false,
              lastUpdatedAt: openFallbackMarkets.map((market) => market.lastUpdatedAt ?? market.lastSyncedAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString(),
              markets: openFallbackMarkets,
              diagnostics: {
                ...cached.diagnostics,
                fallbackUsedLastRequest: true,
              },
            }), {
              headers: { "x-market-source": "polymarket_gamma_fallback" },
            });
          }
        } catch (fallbackError) {
          console.warn("public external markets fallback failed; returning cache state", {
            source: "polymarket_gamma_fallback",
            message: safeMessage(fallbackError),
          });
        }
      }

      return NextResponse.json(marketsEnvelope({
        source: "supabase_cache",
        fallbackUsed: false,
        stale: cached.stale,
        lastUpdatedAt: cached.lastUpdatedAt,
        markets: filterMarketsByStatus(markets, status),
        diagnostics: cached.diagnostics,
      }), {
        headers: { "x-market-source": "supabase_cache" },
      });
    }

    if (status === "open") {
      const fallbackMarkets = await readPolymarketGammaFallbackMarkets();
      const translatedFallbackMarkets = await applyMarketTranslations(supabase, fallbackMarkets, locale);
      return NextResponse.json(marketsEnvelope({
        source: "polymarket_gamma_fallback",
        fallbackUsed: true,
        stale: !hasFreshOpenMarket(translatedFallbackMarkets),
        lastUpdatedAt: translatedFallbackMarkets.map((market) => market.lastUpdatedAt ?? market.lastSyncedAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString(),
        markets: filterMarketsByStatus(translatedFallbackMarkets, status),
        diagnostics: fallbackDiagnostics({
          supabaseCacheReachable: true,
          marketCacheRowCount: 0,
          staleMarketCount: 0,
          fallbackUsedLastRequest: true,
        }),
      }), {
        headers: {
          "x-market-source": "polymarket_gamma_fallback",
        },
      });
    }

    return NextResponse.json(marketsEnvelope({
      source: "supabase_cache",
      fallbackUsed: false,
      stale: true,
      lastUpdatedAt: null,
      markets: [],
      diagnostics: fallbackDiagnostics({
        supabaseCacheReachable: true,
        marketCacheRowCount: 0,
        staleMarketCount: 0,
        fallbackUsedLastRequest: false,
      }),
    }), {
      headers: {
        "x-market-source": "supabase_cache",
      },
    });
  } catch (error) {
    console.warn("public external markets cache source failed", {
      source: "supabase_cache",
      message: safeMessage(error),
    });
    if (resolveStatusFilter(request) === "open") {
      try {
        const fallbackMarkets = await readPolymarketGammaFallbackMarkets();
        return NextResponse.json(marketsEnvelope({
          source: "polymarket_gamma_fallback",
          fallbackUsed: true,
          stale: !hasFreshOpenMarket(fallbackMarkets),
          lastUpdatedAt: fallbackMarkets.map((market) => market.lastUpdatedAt ?? market.lastSyncedAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString(),
          markets: filterMarketsByStatus(fallbackMarkets, "open"),
          diagnostics: fallbackDiagnostics({
            supabaseCacheReachable: false,
            fallbackUsedLastRequest: true,
            errorCode: "SUPABASE_CACHE_UNAVAILABLE",
          }),
        }), {
          headers: { "x-market-source": "polymarket_gamma_fallback" },
        });
      } catch (fallbackError) {
        console.warn("public external markets fallback failed after cache source failure", {
          source: "polymarket_gamma_fallback",
          message: safeMessage(fallbackError),
        });
      }
    }
    return NextResponse.json(
      {
        ...unavailablePayload("supabase_cache"),
        fallbackUsed: false,
        stale: true,
        lastUpdatedAt: null,
        markets: [],
        diagnostics: fallbackDiagnostics({
          fallbackUsedLastRequest: false,
          errorCode: "MARKET_SOURCE_UNAVAILABLE",
        }),
      },
      { status: 503 },
    );
  }
}

export async function externalMarketDetailResponse(source: string, externalId: string, request?: Request, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const supabase = adminSupabase();
    const locale = resolveMarketLocale(request ? new URL(request.url).searchParams.get("locale") : null);
    const market = source === "polymarket"
      ? await readExternalMarketByIdFromCache(supabase, decodeURIComponent(externalId))
        ?? await readExternalMarketBySlugFromCache(supabase, decodeURIComponent(externalId))
      : await readExternalMarketBySourceAndId(supabase, source, externalId);
    const [localized] = market ? await applyMarketTranslations(supabase, [market], locale) : [null];
    return NextResponse.json({ market: localized }, { status: localized ? 200 : 404 });
  } catch (error) {
    console.warn("public external market detail unavailable; serving null", error);
    return NextResponse.json({ market: null }, { status: 404 });
  }
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const buildDepth = (orderbook: Array<{ bids: unknown; asks: unknown }>) => {
  const depth: Array<{ side: "bid" | "ask"; price: number | null; size: number | null; cumulativeSize: number | null }> = [];
  for (const snapshot of orderbook) {
    for (const [side, levels] of [["bid", snapshot.bids], ["ask", snapshot.asks]] as const) {
      if (!Array.isArray(levels)) continue;
      let cumulativeSize = 0;
      for (const level of levels.slice(0, 20)) {
        const record = level && typeof level === "object" ? level as Record<string, unknown> : {};
        const price = toNumber(record.price);
        const size = toNumber(record.size);
        if (size !== null) cumulativeSize += size;
        depth.push({ side, price, size, cumulativeSize: size === null ? null : cumulativeSize });
      }
    }
  }
  return depth;
};

export async function externalMarketOrderbookResponse(source: string, externalId: string, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const market = await readExternalMarketBySourceAndId(adminSupabase(), source, externalId);
    const orderbook = market?.latestOrderbook ?? [];
    return NextResponse.json({ orderbook, depth: buildDepth(orderbook) });
  } catch (error) {
    console.warn("public external market orderbook unavailable; serving safe empty state", error);
    return NextResponse.json({ orderbook: [], depth: [] });
  }
}

export async function externalMarketTradesResponse(source: string, externalId: string, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const market = await readExternalMarketBySourceAndId(adminSupabase(), source, externalId);
    return NextResponse.json({ source, externalId, trades: market?.recentTrades ?? [] });
  } catch (error) {
    console.warn("public external market trades unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, trades: [] });
  }
}

export async function externalMarketHistoryResponse(source: string, externalId: string, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const market = await readExternalMarketBySourceAndId(adminSupabase(), source, externalId);
    const history = (market?.recentTrades ?? []).map((trade) => ({
      timestamp: trade.tradedAt,
      outcome: trade.externalOutcomeId,
      price: trade.price,
      volume: trade.size,
      liquidity: market?.liquidity ?? market?.volumeTotal ?? null,
      source: market?.source ?? source,
      provenance: { source: market?.source ?? source, upstream: "external_trade_ticks" },
    })).reverse();
    return NextResponse.json({ source, externalId, history });
  } catch (error) {
    console.warn("public external market history unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, history: [] });
  }
}

export async function externalMarketStatsResponse(source: string, externalId: string, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const market = await readExternalMarketBySourceAndId(adminSupabase(), source, externalId);
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
    console.warn("public external market stats unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, volume24h: null, liquidity: null, spread: null, closeTime: null, lastUpdatedAt: null, stale: true });
  }
}
