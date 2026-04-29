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
  getExternalMarketRecord(source, externalId);

export const getExternalMarketTradesBySourceAndId = async (source: string, externalId: string) =>
  listExternalMarketTrades(source, externalId);
