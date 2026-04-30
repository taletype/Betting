export interface PolymarketEvent {
  id?: string | number;
  slug?: string;
  title?: string;
  question?: string;
  description?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  end_date_iso?: string;
  closedTime?: string;
  resolved_at?: string;
  volume?: number | string;
  volume24hr?: number | string;
  markets?: PolymarketMarket[];
}

export interface PolymarketToken {
  token_id?: string;
  tokenId?: string;
  outcome?: string;
  winner?: boolean;
  price?: number | string;
  bestBid?: number | string;
  bestAsk?: number | string;
  volume?: number | string;
}

export interface PolymarketMarket {
  id?: string | number;
  conditionId?: string;
  slug?: string;
  question?: string;
  description?: string;
  status?: string;
  resolutionStatus?: string;
  resolution_status?: string;
  archived?: boolean;
  cancelled?: boolean;
  closed?: boolean;
  active?: boolean;
  restricted?: boolean;
  endDate?: string;
  end_date_iso?: string;
  closedTime?: string;
  closeTime?: string;
  resolved_at?: string;
  resolvedAt?: string;
  bestBid?: number | string;
  bestAsk?: number | string;
  lastTradePrice?: number | string;
  volume24hr?: number | string;
  volume?: number | string;
  url?: string;
  outcomes?: string | string[];
  outcomePrices?: string | number[] | string[];
  clobTokenIds?: string | string[];
  tokens?: PolymarketToken[];
  events?: PolymarketEvent[];
}

export interface PolymarketDataTrade {
  proxyWallet?: string;
  side?: string;
  asset?: string;
  conditionId?: string;
  size?: number | string;
  price?: number | string;
  timestamp?: number | string;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  transactionHash?: string;
}

export interface PolymarketBookLevel {
  price?: string | number;
  size?: string | number;
}

export interface PolymarketBookPayload {
  asset_id?: string;
  market?: string;
  timestamp?: string | number;
  tick_size?: string | number;
  min_order_size?: string | number;
  bids?: PolymarketBookLevel[];
  asks?: PolymarketBookLevel[];
}
