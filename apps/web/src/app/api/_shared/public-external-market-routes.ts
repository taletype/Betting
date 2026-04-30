import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

import { readExternalMarketBySourceAndId, readExternalMarkets } from "./external-market-read";
import {
  readPolymarketGammaFallbackMarketBySlugOrId,
  readPolymarketGammaFallbackMarkets,
} from "./polymarket-gamma-fallback";

const getAdminSupabase = () => createSupabaseAdminClient();

export async function externalMarketsResponse() {
  try {
    return NextResponse.json(await readExternalMarkets(getAdminSupabase()));
  } catch (error) {
    console.warn("public external markets unavailable; serving fallback or empty state", error);
    try {
      return NextResponse.json(await readPolymarketGammaFallbackMarkets());
    } catch (fallbackError) {
      console.warn("public external markets fallback unavailable", fallbackError);
      return NextResponse.json([]);
    }
  }
}

export async function externalMarketDetailResponse(source: string, externalId: string) {
  try {
    const market = await readExternalMarketBySourceAndId(getAdminSupabase(), source, externalId);
    return NextResponse.json({ market }, { status: market ? 200 : 404 });
  } catch (error) {
    console.warn("public external market detail unavailable; serving fallback or null", error);
    const normalizedId = decodeURIComponent(externalId).toLowerCase();
    let market = null;
    try {
      market = source === "polymarket" ? await readPolymarketGammaFallbackMarketBySlugOrId(externalId) : null;
    } catch {
      market = null;
    }
    if (!market) {
      try {
        market = (await readPolymarketGammaFallbackMarkets()).find((item) =>
          item.source === source &&
          (item.externalId.toLowerCase() === normalizedId || item.slug.toLowerCase() === normalizedId || item.id.toLowerCase() === normalizedId)
        ) ?? null;
      } catch {
        market = null;
      }
    }
    return NextResponse.json({ market }, { status: market ? 200 : 404 });
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

export async function externalMarketOrderbookResponse(source: string, externalId: string) {
  try {
    const market = await readExternalMarketBySourceAndId(getAdminSupabase(), source, externalId);
    const orderbook = market?.latestOrderbook ?? [];
    return NextResponse.json({ orderbook, depth: buildDepth(orderbook) });
  } catch (error) {
    console.warn("public external market orderbook unavailable; serving safe empty state", error);
    return NextResponse.json({ orderbook: [], depth: [] });
  }
}

export async function externalMarketTradesResponse(source: string, externalId: string) {
  try {
    const market = await readExternalMarketBySourceAndId(getAdminSupabase(), source, externalId);
    return NextResponse.json({ source, externalId, trades: market?.recentTrades ?? [] });
  } catch (error) {
    console.warn("public external market trades unavailable; serving safe empty state", error);
    return NextResponse.json({ source, externalId, trades: [] });
  }
}

export async function externalMarketHistoryResponse(source: string, externalId: string) {
  try {
    const market = await readExternalMarketBySourceAndId(getAdminSupabase(), source, externalId);
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

export async function externalMarketStatsResponse(source: string, externalId: string) {
  try {
    const market = await readExternalMarketBySourceAndId(getAdminSupabase(), source, externalId);
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
