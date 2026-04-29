import { fetchPolymarketGammaMarkets } from "@bet/integrations";

type NormalizedGammaMarket = Awaited<ReturnType<typeof fetchPolymarketGammaMarkets>>[number]["market"];
type GammaProvenance = Awaited<ReturnType<typeof fetchPolymarketGammaMarkets>>[number]["provenance"];

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
  latestOrderbook: Array<{
    externalOutcomeId: string;
    bids: unknown;
    asks: unknown;
    capturedAt: string;
    lastTradePrice: number | null;
    bestBid: number | null;
    bestAsk: number | null;
  }>;
}

const mapGammaMarket = (
  market: NormalizedGammaMarket,
  provenance: GammaProvenance,
): PublicExternalMarketRecord => {
  const updatedAt = provenance.fetchedAt;

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
  (await fetchPolymarketGammaMarkets()).map((record) => mapGammaMarket(record.market, record.provenance));
