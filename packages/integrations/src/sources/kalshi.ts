import type {
  ExternalMarketAdapter,
  NormalizedExternalMarket,
  NormalizedExternalOutcome,
  NormalizedExternalTradeTick,
} from "../index";

const KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

interface KalshiMarket {
  ticker?: string;
  title?: string;
  subtitle?: string;
  status?: string;
  close_time?: string;
  latest_expiration_time?: string;
  expiration_time?: string;
  open_interest?: number | string;
  yes_bid_dollars?: number | string;
  yes_ask_dollars?: number | string;
  no_bid_dollars?: number | string;
  no_ask_dollars?: number | string;
  last_price_dollars?: number | string;
  volume_fp?: number | string;
  volume_24h_fp?: number | string;
  yes_bid?: number | string;
  yes_ask?: number | string;
  no_bid?: number | string;
  no_ask?: number | string;
  last_price?: number | string;
  volume?: number | string;
  volume_24h?: number | string;
}

interface KalshiMarketsResponse {
  markets?: KalshiMarket[];
}

interface KalshiTrade {
  trade_id?: string;
  ticker?: string;
  count_fp?: number | string;
  yes_price_dollars?: number | string;
  no_price_dollars?: number | string;
  taker_side?: string;
  created_time?: string;
}

interface KalshiTradesResponse {
  trades?: KalshiTrade[];
}

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parsePrice = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }

  if (parsed > 1 && parsed <= 100) {
    return parsed / 100;
  }

  return parsed;
};

const toIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const outcomeFromQuote = (
  id: string,
  title: string,
  index: number,
  bid: number | null,
  ask: number | null,
  lastPrice: number | null,
): NormalizedExternalOutcome => ({
  externalOutcomeId: id,
  title,
  slug: title.toLowerCase(),
  outcomeIndex: index,
  yesNo: title.toLowerCase() === "yes" ? "yes" : "no",
  bestBid: bid,
  bestAsk: ask,
  lastPrice,
  volume: null,
});

const marketToTradeTicks = (ticker: string, lastPrice: number | null): NormalizedExternalTradeTick[] =>
  lastPrice === null
    ? []
    : [
        {
          tradeId: `${ticker}:last`,
          outcomeExternalId: "yes",
          side: null,
          price: lastPrice,
          size: null,
          tradedAt: null,
        },
      ];

const mapTrade = (trade: KalshiTrade): NormalizedExternalTradeTick | null => {
  if (!trade.trade_id) {
    return null;
  }

  const side = trade.taker_side?.trim().toLowerCase();
  const outcomeExternalId = side === "yes" ? "yes" : side === "no" ? "no" : null;
  const price =
    outcomeExternalId === "no"
      ? parsePrice(trade.no_price_dollars)
      : parsePrice(trade.yes_price_dollars);

  if (price === null) {
    return null;
  }

  return {
    tradeId: trade.trade_id,
    outcomeExternalId,
    side: null,
    price,
    size: parseNumber(trade.count_fp),
    tradedAt: toIsoOrNull(trade.created_time),
  };
};

const attachRecentTrades = async (
  markets: readonly NormalizedExternalMarket[],
): Promise<NormalizedExternalMarket[]> => {
  const response = await fetch(`${KALSHI_BASE_URL}/markets/trades?limit=500`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kalshi trades request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as KalshiTradesResponse;
  const tradesByTicker = new Map<string, NormalizedExternalTradeTick[]>();

  for (const trade of payload.trades ?? []) {
    const ticker = trade.ticker;
    const mapped = mapTrade(trade);
    if (!ticker || !mapped) {
      continue;
    }

    const current = tradesByTicker.get(ticker) ?? [];
    current.push(mapped);
    tradesByTicker.set(ticker, current);
  }

  return markets.map((market) => ({
    ...market,
    recentTrades: tradesByTicker.get(market.externalId)?.slice(0, 20) ?? market.recentTrades,
  }));
};

const mapMarket = (market: KalshiMarket): NormalizedExternalMarket | null => {
  if (!market.ticker || !market.title) {
    return null;
  }

  const yesBid = parsePrice(market.yes_bid_dollars ?? market.yes_bid);
  const yesAsk = parsePrice(market.yes_ask_dollars ?? market.yes_ask);
  const noBid = parsePrice(market.no_bid_dollars ?? market.no_bid);
  const noAsk = parsePrice(market.no_ask_dollars ?? market.no_ask);
  const lastPrice = parsePrice(market.last_price_dollars ?? market.last_price);

  const outcomes: NormalizedExternalOutcome[] = [
    outcomeFromQuote("yes", "Yes", 0, yesBid, yesAsk, lastPrice),
    outcomeFromQuote("no", "No", 1, noBid, noAsk, lastPrice === null ? null : 1 - lastPrice),
  ];

  const status = market.status?.toLowerCase();

  return {
    source: "kalshi",
    externalId: market.ticker,
    slug: market.ticker.toLowerCase(),
    title: market.title,
    description: market.subtitle ?? "",
    url: `https://kalshi.com/markets/${market.ticker.toLowerCase()}`,
    imageUrl: null,
    iconUrl: null,
    imageSourceUrl: null,
    imageUpdatedAt: null,
    status:
      status === "settled" ? "resolved" : status === "open" ? "open" : status === "closed" ? "closed" : "closed",
    closeTime: toIsoOrNull(market.close_time),
    endTime: toIsoOrNull(market.latest_expiration_time ?? market.expiration_time),
    resolvedAt: status === "settled" ? toIsoOrNull(market.latest_expiration_time ?? market.expiration_time) : null,
    bestBid: yesBid,
    bestAsk: yesAsk,
    lastTradePrice: lastPrice,
    volume24h: parseNumber(market.volume_24h_fp ?? market.volume_24h),
    volumeTotal: parseNumber(market.volume_fp ?? market.volume) ?? parseNumber(market.open_interest),
    outcomes,
    recentTrades: marketToTradeTicks(market.ticker, lastPrice),
    rawPayload: market,
  };
};

export const createKalshiAdapter = (): ExternalMarketAdapter => ({
  source: "kalshi",
  async listMarkets(): Promise<NormalizedExternalMarket[]> {
    const response = await fetch(`${KALSHI_BASE_URL}/markets?limit=100&status=open`, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Kalshi request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as KalshiMarketsResponse;
    const markets = payload.markets ?? [];

    const mappedMarkets = markets
      .map((entry) => mapMarket(entry))
      .filter((entry): entry is NormalizedExternalMarket => entry !== null);

    return attachRecentTrades(mappedMarkets);
  },
});
