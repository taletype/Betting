export type ExternalSource = "polymarket" | "kalshi";

export interface NormalizedExternalOutcome {
  externalOutcomeId: string;
  title: string;
  slug: string;
  outcomeIndex: number;
  yesNo: "yes" | "no" | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
  volume: number | null;
}

export interface NormalizedExternalTradeTick {
  tradeId: string;
  outcomeExternalId: string | null;
  side: "buy" | "sell" | null;
  price: number;
  size: number | null;
  tradedAt: string | null;
  rawJson?: unknown;
  sourceProvenance?: unknown;
}

export interface NormalizedExternalMarket {
  source: ExternalSource;
  externalId: string;
  slug: string;
  title: string;
  description: string;
  url: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  imageSourceUrl: string | null;
  imageUpdatedAt: string | null;
  status: "open" | "closed" | "resolved" | "cancelled";
  closeTime: string | null;
  endTime: string | null;
  resolvedAt: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  volume24h: number | null;
  volumeTotal: number | null;
  outcomes: NormalizedExternalOutcome[];
  recentTrades: NormalizedExternalTradeTick[];
  rawPayload: unknown;
}

export interface ExternalMarketAdapter {
  readonly source: ExternalSource;
  listMarkets(): Promise<NormalizedExternalMarket[]>;
}

export * from "./sources/kalshi";
export * from "./sources/polymarket";

export * from "./polymarket/gamma";
export * from "./polymarket/clob";
export * from "./polymarket/builder";
export * from "./polymarket/normalize";
export * from "./polymarket/data";
export * from "./polymarket/trades";
export * from "./polymarket/types";
export * from "./polymarket/provenance";
