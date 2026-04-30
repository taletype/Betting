import { getExternalMarketRecord, listExternalMarketRecords, listExternalMarketTrades } from "./repository";

export const listExternalMarkets = async () => {
  const records = await listExternalMarketRecords();
  return records;
};

export const getExternalMarketBySourceAndId = async (source: string, externalId: string) =>
  getExternalMarketRecord(source, externalId);

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
