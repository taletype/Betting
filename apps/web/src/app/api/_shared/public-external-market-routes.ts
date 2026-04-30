import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

import {
  readExternalMarketByIdFromCache,
  readExternalMarketBySlugFromCache,
  readExternalMarketsFromCache,
  type ExternalMarketCacheDiagnostics,
} from "./external-market-cache";
import { applyMarketTranslations, resolveMarketLocale } from "./market-translation";
import { readExternalMarketBySourceAndId, readExternalMarkets } from "./external-market-read";

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

const fallbackDiagnostics = (input?: Partial<ExternalMarketCacheDiagnostics>): ExternalMarketCacheDiagnostics => ({
  supabaseCacheReachable: false,
  marketCacheRowCount: null,
  newestLastSyncedAt: null,
  staleMarketCount: null,
  lastSyncStatus: null,
  fallbackUsedLastRequest: false,
  routedTradingEnabled: process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true" || process.env.NEXT_PUBLIC_POLYMARKET_ROUTED_TRADING_ENABLED === "true",
  builderCodeConfigured: Boolean(process.env.POLY_BUILDER_CODE?.trim() || process.env.POLYMARKET_BUILDER_CODE?.trim()),
  ...input,
});

const marketsEnvelope = (input: {
  source: "supabase_cache";
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
    const locale = resolveMarketLocale(request ? new URL(request.url).searchParams.get("locale") : null);
    const cached = await readExternalMarketsFromCache(supabase);
    if (cached.markets.length > 0) {
      const markets = await applyMarketTranslations(supabase, cached.markets, locale);
      return NextResponse.json(marketsEnvelope({
        source: "supabase_cache",
        fallbackUsed: false,
        stale: cached.stale,
        lastUpdatedAt: cached.lastUpdatedAt,
        markets,
        diagnostics: cached.diagnostics,
      }), {
        headers: { "x-market-source": "supabase_cache" },
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
