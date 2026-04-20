import type {
  ExternalMarketAdapter,
  NormalizedExternalMarket,
  NormalizedExternalOutcome,
  NormalizedExternalTradeTick,
} from "../index";

const KALSHI_BASE_URL = "https://api.kalshi.com/trade-api/v2";

interface KalshiMarket {
  ticker?: string;
  title?: string;
  subtitle?: string;
  status?: string;
  close_time?: string;
  expiration_time?: string;
  open_interest?: number | string;
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

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

const mapMarket = (market: KalshiMarket): NormalizedExternalMarket | null => {
  if (!market.ticker || !market.title) {
    return null;
  }

  const yesBid = parseNumber(market.yes_bid);
  const yesAsk = parseNumber(market.yes_ask);
  const noBid = parseNumber(market.no_bid);
  const noAsk = parseNumber(market.no_ask);
  const lastPrice = parseNumber(market.last_price);

  const outcomes: NormalizedExternalOutcome[] = [
    outcomeFromQuote("yes", "Yes", 0, yesBid, yesAsk, lastPrice),
    outcomeFromQuote("no", "No", 1, noBid, noAsk, lastPrice === null ? null : 100 - lastPrice),
  ];

  const status = market.status?.toLowerCase();

  return {
    source: "kalshi",
    externalId: market.ticker,
    slug: market.ticker.toLowerCase(),
    title: market.title,
    description: market.subtitle ?? "",
    url: `https://kalshi.com/markets/${market.ticker.toLowerCase()}`,
    status: status === "open" ? "open" : status === "settled" ? "resolved" : "closed",
    closeTime: toIsoOrNull(market.close_time),
    endTime: toIsoOrNull(market.expiration_time),
    resolvedAt: status === "settled" ? toIsoOrNull(market.expiration_time) : null,
    bestBid: yesBid,
    bestAsk: yesAsk,
    lastTradePrice: lastPrice,
    volume24h: parseNumber(market.volume_24h),
    volumeTotal: parseNumber(market.volume) ?? parseNumber(market.open_interest),
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

    return markets
      .map((entry) => mapMarket(entry))
      .filter((entry): entry is NormalizedExternalMarket => entry !== null);
  },
});
