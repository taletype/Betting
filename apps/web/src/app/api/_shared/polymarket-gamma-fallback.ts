import { fetchPolymarketGammaEventMarketBySlug, fetchPolymarketGammaEventMarkets, fetchPolymarketGammaMarketBySlug, fetchPolymarketGammaMarkets } from "@bet/integrations";

type NormalizedGammaMarket = Awaited<ReturnType<typeof fetchPolymarketGammaMarkets>>[number]["market"];
type GammaProvenance = Awaited<ReturnType<typeof fetchPolymarketGammaMarkets>>[number]["provenance"];

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

export interface PublicExternalMarketRecord {
  id: string;
  source: "polymarket" | "kalshi";
  externalId: string;
  slug: string;
  title: string;
  question?: string;
  description: string;
  status: "open" | "closed" | "resolved" | "cancelled";
  marketUrl: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  imageSourceUrl: string | null;
  imageUpdatedAt: string | null;
  closeTime: string | null;
  endTime: string | null;
  resolvedAt: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  volume24h: number | null;
  volumeTotal: number | null;
  liquidity: number | null;
  provenance: unknown;
  sourceProvenance: unknown;
  lastSyncedAt: string | null;
  lastUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  outcomes: Array<{
    externalOutcomeId: string;
    title: string;
    slug: string;
    index: number;
    yesNo: "yes" | "no" | null;
    bestBid: number | null;
    bestAsk: number | null;
    lastPrice: number | null;
    volume: number | null;
  }>;
  recentTrades: Array<{
    externalTradeId: string;
    externalOutcomeId: string | null;
    side: "buy" | "sell" | null;
    price: number | null;
    size: number | null;
    tradedAt: string;
  }>;
  normalizedRecentTrades?: Array<{
    timestamp: string;
    price: number;
    size?: number;
    side?: string;
    outcome?: string;
    source?: string;
  }>;
  priceHistory?: Array<{
    timestamp: string;
    outcome?: string;
    price: number;
    source?: "cache" | "gamma" | "clob" | "data_api";
  }>;
  volumeHistory?: Array<{
    timestamp: string;
    volume: number;
    source?: "cache" | "gamma" | "clob" | "data_api";
  }>;
  liquidityHistory?: Array<{
    timestamp: string;
    liquidity: number;
    source?: "cache" | "gamma" | "clob" | "data_api";
  }>;
  orderbookDepth?: {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
    updatedAt?: string;
    source?: string;
  };
  spread?: number | null;
  chartUpdatedAt?: string;
  chartSource?: string;
  latestOrderbook: Array<{
    externalOutcomeId: string;
    bids: unknown;
    asks: unknown;
    capturedAt: string;
    lastTradePrice: number | null;
    bestBid: number | null;
    bestAsk: number | null;
  }>;
  titleOriginal?: string;
  titleLocalized?: string;
  descriptionOriginal?: string;
  descriptionLocalized?: string;
  outcomesOriginal?: PublicExternalMarketRecord["outcomes"];
  outcomesLocalized?: PublicExternalMarketRecord["outcomes"];
  locale?: "zh-HK" | "zh-CN" | "en";
  translationStatus?: "pending" | "translated" | "reviewed" | "failed" | "stale" | "skipped" | "original";
}

const mapGammaMarket = (
  market: NormalizedGammaMarket,
  provenance: GammaProvenance,
  options: { fetchedVia?: string } = {},
): PublicExternalMarketRecord => {
  const updatedAt = provenance.fetchedAt;
  const rawRecord = market.rawPayload && typeof market.rawPayload === "object" ? market.rawPayload as Record<string, unknown> : {};
  const fallbackProvenance = {
    ...provenance,
    dataPath: "fallback",
    fetchedVia: options.fetchedVia ?? "public-gamma-fallback",
    statusFlags: {
      active: readBooleanFlag(rawRecord, "active"),
      closed: readBooleanFlag(rawRecord, "closed"),
      archived: readBooleanFlag(rawRecord, "archived"),
      cancelled: readBooleanFlag(rawRecord, "cancelled", "canceled"),
      acceptingOrders: readBooleanFlag(rawRecord, "accepting_orders", "acceptingOrders"),
      enableOrderBook: readBooleanFlag(rawRecord, "enable_order_book", "enableOrderBook", "orderBookEnabled"),
      restricted: readBooleanFlag(rawRecord, "restricted"),
      endDate: typeof rawRecord.endDate === "string" ? rawRecord.endDate : null,
      endDateIso: typeof rawRecord.end_date_iso === "string" ? rawRecord.end_date_iso : null,
    },
    stale: false,
  };

  return {
    id: `polymarket:${market.externalId}`,
    source: "polymarket",
    externalId: market.externalId,
    slug: market.slug,
    title: market.title,
    question: market.title,
    description: market.description,
    status: market.status,
    marketUrl: market.url,
    imageUrl: market.imageUrl,
    iconUrl: market.iconUrl,
    imageSourceUrl: market.imageSourceUrl,
    imageUpdatedAt: market.imageUpdatedAt,
    closeTime: market.closeTime,
    endTime: market.endTime,
    resolvedAt: market.resolvedAt,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    lastTradePrice: market.lastTradePrice,
    volume24h: market.volume24h,
    volumeTotal: market.volumeTotal,
    liquidity: market.volumeTotal,
    provenance: fallbackProvenance,
    sourceProvenance: fallbackProvenance,
    lastSyncedAt: updatedAt,
    lastUpdatedAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
    outcomes: market.outcomes.map((outcome) => ({
      externalOutcomeId: outcome.externalOutcomeId,
      title: outcome.title,
      slug: outcome.slug,
      index: outcome.outcomeIndex,
      yesNo: outcome.yesNo,
      bestBid: outcome.bestBid,
      bestAsk: outcome.bestAsk,
      lastPrice: outcome.lastPrice,
      volume: outcome.volume,
    })),
    recentTrades: market.recentTrades.map((trade) => ({
      externalTradeId: trade.tradeId,
      externalOutcomeId: trade.outcomeExternalId,
      side: trade.side,
      price: trade.price,
      size: trade.size,
      tradedAt: trade.tradedAt ?? updatedAt,
    })),
    latestOrderbook: [],
  };
};

export const readPolymarketGammaFallbackMarkets = async (): Promise<PublicExternalMarketRecord[]> =>
  (await fetchPolymarketGammaEventMarkets({ limit: 50 })).map((record) => mapGammaMarket(record.market, record.provenance));

export const readPolymarketGammaFallbackMarketBySlugOrId = async (
  slugOrId: string,
): Promise<PublicExternalMarketRecord | null> => {
  const record = await fetchPolymarketGammaMarketBySlug(slugOrId)
    ?? await fetchPolymarketGammaEventMarketBySlug(slugOrId);
  return record ? mapGammaMarket(record.market, record.provenance, { fetchedVia: "public-gamma-detail-fallback" }) : null;
};

export const normalizePolymarketGammaDetailRecord = mapGammaMarket;
