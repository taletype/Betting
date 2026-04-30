import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import {
  readExternalMarketByIdFromCache,
  readExternalMarketBySlugFromCache,
  readExternalMarketsFromCache,
  upsertExternalMarketsCache,
  type ExternalMarketCacheDiagnostics,
} from "./external-market-cache";
import { applyMarketTranslations, resolveMarketLocale } from "./market-translation";
import { readExternalMarketBySourceAndId, readExternalMarkets } from "./external-market-read";
import {
  normalizeLiquidityHistory,
  normalizeOrderbookDepth,
  normalizeRecentTrades,
} from "./chart-history";
import { readPolymarketGammaFallbackMarketBySlugOrId, readPolymarketGammaFallbackMarkets, type PublicExternalMarketRecord } from "./polymarket-gamma-fallback";
import { resolvePolymarketDetailSlug } from "./polymarket-detail-slug";

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

const detailEnvelope = (input: {
  market: unknown | null;
  source: "supabase_cache" | "polymarket_gamma_detail_fallback" | "not_found";
  detailFallbackAvailable: boolean;
  detailFallbackUsed: boolean;
  lookupSlug: string;
  canonicalSlug: string;
  cacheAvailable: boolean;
  serviceApiReachable: boolean;
  staleCache: boolean;
}) => ({
  market: input.market,
  diagnostics: {
    feedCacheAvailable: input.cacheAvailable,
    detailFallbackAvailable: input.detailFallbackAvailable,
    serviceApiReachable: input.serviceApiReachable,
    gammaFallbackEnabled: input.detailFallbackAvailable,
    gammaFallbackUsed: input.detailFallbackUsed,
    staleCache: input.staleCache,
    detailNotFound: input.market === null,
    source: input.source,
    lookupSlug: input.lookupSlug,
    canonicalSlug: input.canonicalSlug,
  },
});

const toCacheInput = (market: PublicExternalMarketRecord) => ({
  market: {
    source: market.source,
    externalId: market.externalId,
    slug: market.slug,
    title: market.title,
    description: market.description,
    url: market.marketUrl,
    status: market.status,
    closeTime: market.closeTime,
    endTime: market.endTime,
    resolvedAt: market.resolvedAt,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    lastTradePrice: market.lastTradePrice,
    volume24h: market.volume24h,
    volumeTotal: market.volumeTotal,
    outcomes: market.outcomes.map((outcome) => ({
      externalOutcomeId: outcome.externalOutcomeId,
      title: outcome.title,
      slug: outcome.slug,
      outcomeIndex: outcome.index,
      yesNo: outcome.yesNo,
      bestBid: outcome.bestBid,
      bestAsk: outcome.bestAsk,
      lastPrice: outcome.lastPrice,
      volume: outcome.volume,
    })),
    recentTrades: market.recentTrades
      .filter((trade) => trade.price !== null)
      .map((trade) => ({
        tradeId: trade.externalTradeId,
        outcomeExternalId: trade.externalOutcomeId,
        side: trade.side,
        price: trade.price ?? 0,
        size: trade.size,
        tradedAt: trade.tradedAt,
      })),
    rawPayload: {
      market,
      provenance: market.sourceProvenance ?? market.provenance,
    },
  },
  rawJson: {
    market,
    provenance: market.sourceProvenance ?? market.provenance,
  },
  sourceProvenance: market.sourceProvenance ?? market.provenance,
  staleAfter: new Date(Date.now() + 60_000).toISOString(),
});

const tryUpsertDetailFallback = async (supabase: ReturnType<SupabaseAdminFactory>, market: PublicExternalMarketRecord): Promise<void> => {
  try {
    await upsertExternalMarketsCache(supabase, [toCacheInput(market)]);
  } catch (error) {
    console.warn("polymarket detail fallback cache upsert failed; continuing with fetched detail", {
      message: safeMessage(error),
      externalId: market.externalId,
    });
  }
};

const findPolymarketFallbackMarket = (
  markets: PublicExternalMarketRecord[],
  candidates: string[],
): PublicExternalMarketRecord | null => {
  const normalizedCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  return markets.find((market) =>
    normalizedCandidates.has(market.slug.toLowerCase()) ||
    normalizedCandidates.has(market.externalId.toLowerCase()) ||
    normalizedCandidates.has(market.id.toLowerCase())
  ) ?? null;
};

const readPolymarketDetailFallback = async (
  candidates: string[],
): Promise<PublicExternalMarketRecord | null> => {
  for (const candidate of candidates) {
    const market = await readPolymarketGammaFallbackMarketBySlugOrId(candidate).catch((error) => {
      console.warn("polymarket detail Gamma direct lookup failed; trying next candidate", {
        message: safeMessage(error),
        candidate,
      });
      return null;
    });
    if (market) return market;
  }

  const fallbackMarkets = await readPolymarketGammaFallbackMarkets();
  return findPolymarketFallbackMarket(fallbackMarkets, candidates);
};

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
  const slugResolution = resolvePolymarketDetailSlug(externalId);
  try {
    const supabase = adminSupabase();
    const locale = resolveMarketLocale(request ? new URL(request.url).searchParams.get("locale") : null);
    const cacheCandidates = slugResolution.candidates;
    let market: PublicExternalMarketRecord | null = null;
    let detailFallbackUsed = false;

    if (source === "polymarket") {
      for (const candidate of cacheCandidates) {
        market = await readExternalMarketBySlugFromCache(supabase, candidate);
        if (market) break;
      }
      if (!market) {
        for (const candidate of cacheCandidates) {
          market = await readExternalMarketByIdFromCache(supabase, candidate);
          if (market) break;
        }
      }
      if (!market) {
        market = await readPolymarketDetailFallback(cacheCandidates);
        if (market) {
          detailFallbackUsed = true;
          await tryUpsertDetailFallback(supabase, market);
        }
      }
    } else {
      market = await readExternalMarketBySourceAndId(supabase, source, externalId);
    }
    const provenance = market?.sourceProvenance ?? market?.provenance;
    const provenanceRecord = provenance && typeof provenance === "object" ? provenance as Record<string, unknown> : {};
    const [localized] = market ? await applyMarketTranslations(supabase, [market], locale) : [null];
    return NextResponse.json(detailEnvelope({
      market: localized,
      source: localized ? detailFallbackUsed ? "polymarket_gamma_detail_fallback" : "supabase_cache" : "not_found",
      detailFallbackAvailable: source === "polymarket",
      detailFallbackUsed,
      lookupSlug: slugResolution.decodedSlug,
      canonicalSlug: slugResolution.canonicalSlug,
      cacheAvailable: true,
      serviceApiReachable: true,
      staleCache: provenanceRecord.stale === true,
    }), {
      status: localized ? 200 : 404,
      headers: detailFallbackUsed ? { "x-market-source": "polymarket_gamma_detail_fallback" } : undefined,
    });
  } catch (error) {
    if (source === "polymarket") {
      try {
        const fallbackMarket = await readPolymarketDetailFallback(slugResolution.candidates);
        if (fallbackMarket) {
          return NextResponse.json(detailEnvelope({
            market: fallbackMarket,
            source: "polymarket_gamma_detail_fallback",
            detailFallbackAvailable: true,
            detailFallbackUsed: true,
            lookupSlug: slugResolution.decodedSlug,
            canonicalSlug: slugResolution.canonicalSlug,
            cacheAvailable: false,
            serviceApiReachable: false,
            staleCache: false,
          }), {
            status: 200,
            headers: { "x-market-source": "polymarket_gamma_detail_fallback" },
          });
        }
      } catch (fallbackError) {
        console.warn("public external market detail fallback unavailable; serving null", fallbackError);
      }
    }
    console.warn("public external market detail unavailable; serving null", error);
    return NextResponse.json(detailEnvelope({
      market: null,
      source: "not_found",
      detailFallbackAvailable: source === "polymarket",
      detailFallbackUsed: false,
      lookupSlug: slugResolution.decodedSlug,
      canonicalSlug: slugResolution.canonicalSlug,
      cacheAvailable: false,
      serviceApiReachable: false,
      staleCache: false,
    }), { status: 404 });
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
        if (price === null || price < 0 || price > 1 || size === null || size < 0) continue;
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
    const orderbookDepth = market?.orderbookDepth ?? (
      orderbook[0]
        ? normalizeOrderbookDepth({ bids: orderbook[0].bids, asks: orderbook[0].asks, capturedAt: orderbook[0].capturedAt, source: "clob" })
        : { bids: [], asks: [] }
    );
    return NextResponse.json({ orderbook, orderbookDepth, depth: buildDepth(orderbook) });
  } catch (error) {
    console.warn("public external market orderbook unavailable; serving safe empty state", error);
    return NextResponse.json({ orderbook: [], orderbookDepth: { bids: [], asks: [] }, depth: [] });
  }
}

export async function externalMarketTradesResponse(source: string, externalId: string, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const market = await readExternalMarketBySourceAndId(adminSupabase(), source, externalId);
    const recentTrades = market?.normalizedRecentTrades?.length
      ? market.normalizedRecentTrades
      : normalizeRecentTrades({ recentTrades: market?.recentTrades ?? [] }, "cache", 100);
    return NextResponse.json({ source, externalId, trades: market?.recentTrades ?? [], recentTrades });
  } catch (error) {
    console.warn("public external market trades unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, trades: [], recentTrades: [] });
  }
}

export async function externalMarketHistoryResponse(source: string, externalId: string, adminSupabase: SupabaseAdminFactory = getAdminSupabase) {
  try {
    const market = await readExternalMarketBySourceAndId(adminSupabase(), source, externalId);
    const recentTradeHistory = normalizeRecentTrades({ recentTrades: market?.recentTrades ?? [] }, "cache", 100)
      .map((trade) => ({
        timestamp: trade.timestamp,
        outcome: trade.outcome ?? null,
        price: trade.price,
        volume: trade.size ?? null,
        liquidity: null,
        source: source === "polymarket" ? "cache" : source,
        provenance: { source: market?.source ?? source, upstream: "external_trades" },
      }));
    const priceHistory = market?.priceHistory?.length
      ? market.priceHistory
      : recentTradeHistory.flatMap((trade) => trade.price === null ? [] : [{
        timestamp: trade.timestamp,
        ...(trade.outcome ? { outcome: trade.outcome } : {}),
        price: trade.price,
        source: "cache" as const,
      }]);
    const volumeHistory = market?.volumeHistory?.length
      ? market.volumeHistory
      : recentTradeHistory.flatMap((trade) => trade.volume === null ? [] : [{
        timestamp: trade.timestamp,
        volume: trade.volume,
        source: "cache" as const,
      }]);
    const liquidityHistory = market?.liquidityHistory?.length
      ? market.liquidityHistory
      : normalizeLiquidityHistory([], "cache", 100);
    const history = priceHistory.length
      ? priceHistory.map((point) => ({
        timestamp: point.timestamp,
        outcome: point.outcome ?? null,
        price: point.price,
        volume: volumeHistory.find((volume) => volume.timestamp === point.timestamp)?.volume ?? null,
        liquidity: liquidityHistory.find((liquidity) => liquidity.timestamp === point.timestamp)?.liquidity ?? null,
        source: point.source ?? "cache",
        provenance: { source: market?.source ?? source, upstream: "external_market_prices" },
      }))
      : recentTradeHistory;
    return NextResponse.json({
      source,
      externalId,
      history,
      priceHistory,
      volumeHistory,
      liquidityHistory,
      chartUpdatedAt: market?.chartUpdatedAt ?? history.at(-1)?.timestamp ?? null,
      chartSource: market?.chartSource ?? (history.length ? "cache" : null),
    });
  } catch (error) {
    console.warn("public external market history unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, history: [], priceHistory: [], volumeHistory: [], liquidityHistory: [] });
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
