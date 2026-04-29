import { fetchPolymarketGammaMarkets } from "@bet/integrations";

import { getExternalMarketRecord, listExternalMarketRecords, listExternalMarketTrades, type ExternalMarketView } from "./repository";

const listPolymarketGammaFallbackMarkets = async (): Promise<ExternalMarketView[]> =>
  (await fetchPolymarketGammaMarkets()).map(({ market, provenance }) => ({
    id: `polymarket:${market.externalId}`,
    source: "polymarket",
    externalId: market.externalId,
    slug: market.slug,
    title: market.title,
    description: market.description,
    status: market.status,
    marketUrl: market.url,
    closeTime: market.closeTime,
    endTime: market.endTime,
    resolvedAt: market.resolvedAt,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    lastTradePrice: market.lastTradePrice,
    volume24h: market.volume24h,
    volumeTotal: market.volumeTotal,
    liquidity: market.volumeTotal,
    provenance,
    sourceProvenance: provenance,
    lastSyncedAt: provenance.fetchedAt,
    lastUpdatedAt: provenance.fetchedAt,
    createdAt: provenance.fetchedAt,
    updatedAt: provenance.fetchedAt,
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
    recentTrades: [],
    latestOrderbook: [],
  }));

export const listExternalMarkets = async () => {
  try {
    const records = await listExternalMarketRecords();
    if (records.some((market) => market.source === "polymarket")) {
      return records;
    }

    return [...records, ...(await listPolymarketGammaFallbackMarkets())];
  } catch (error) {
    console.warn("external market table read failed; falling back to Polymarket Gamma", error);
    return listPolymarketGammaFallbackMarkets();
  }
};

export const getExternalMarketBySourceAndId = async (source: string, externalId: string) =>
  getExternalMarketRecord(source, externalId).then(async (record) => {
    if (record || source !== "polymarket") {
      return record;
    }

    const normalizedId = externalId.toLowerCase();
    return (await listPolymarketGammaFallbackMarkets()).find((market) =>
      market.externalId.toLowerCase() === normalizedId ||
      market.slug.toLowerCase() === normalizedId ||
      market.id.toLowerCase() === normalizedId
    ) ?? null;
  });

export const getExternalMarketTradesBySourceAndId = async (source: string, externalId: string) =>
  listExternalMarketTrades(source, externalId);

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBookLevels = (side: "bid" | "ask", levels: unknown) => {
  if (!Array.isArray(levels)) return [];
  let cumulativeSize = 0;

  return levels.flatMap((level) => {
    const record = level && typeof level === "object" ? level as Record<string, unknown> : {};
    const price = toNumber(record.price);
    const size = toNumber(record.size);
    if (price === null || size === null) return [];
    cumulativeSize += size;
    return [{ side, price, size, cumulativeSize }];
  });
};

export const getExternalMarketHistoryBySourceAndId = async (source: string, externalId: string) => {
  const trades = await listExternalMarketTrades(source, externalId);
  return (trades ?? []).map((trade) => ({
    timestamp: trade.executedAt,
    outcome: trade.externalOutcomeId,
    price: trade.price,
    volume: trade.size,
    liquidity: null,
    source: trade.source,
    provenance: { source: trade.source, upstream: "external_trade_ticks" },
  })).reverse();
};

export const getExternalMarketOrderbookDepthBySourceAndId = async (source: string, externalId: string) => {
  const market = await getExternalMarketBySourceAndId(source, externalId);
  return (market?.latestOrderbook ?? []).flatMap((book) => [
    ...normalizeBookLevels("bid", book.bids),
    ...normalizeBookLevels("ask", book.asks),
  ]);
};

export const getExternalMarketStatsBySourceAndId = async (source: string, externalId: string) => {
  const market = await getExternalMarketBySourceAndId(source, externalId);
  const lastUpdatedAt = market?.lastUpdatedAt ?? market?.lastSyncedAt ?? null;
  const spread = market?.bestBid !== null && market?.bestAsk !== null && market?.bestBid !== undefined && market?.bestAsk !== undefined
    ? Math.max(0, market.bestAsk - market.bestBid)
    : null;
  const stale = lastUpdatedAt ? Date.now() - new Date(lastUpdatedAt).getTime() > 15 * 60 * 1000 : true;

  return {
    source,
    externalId,
    volume24h: market?.volume24h ?? null,
    liquidity: market?.liquidity ?? market?.volumeTotal ?? null,
    spread,
    closeTime: market?.closeTime ?? null,
    lastUpdatedAt,
    stale,
  };
};
