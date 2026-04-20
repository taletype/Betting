import type {
  ExternalMarketAdapter,
  NormalizedExternalMarket,
  NormalizedExternalOutcome,
  NormalizedExternalTradeTick,
} from "../index";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

interface PolymarketToken {
  token_id?: string;
  tokenId?: string;
  outcome?: string;
  winner?: boolean;
  price?: number | string;
  bestBid?: number | string;
  bestAsk?: number | string;
  volume?: number | string;
}

interface PolymarketMarket {
  id?: string | number;
  slug?: string;
  question?: string;
  description?: string;
  closed?: boolean;
  active?: boolean;
  endDate?: string;
  end_date_iso?: string;
  closedTime?: string;
  resolved_at?: string;
  bestBid?: number | string;
  bestAsk?: number | string;
  lastTradePrice?: number | string;
  volume24hr?: number | string;
  volume?: number | string;
  url?: string;
  tokens?: PolymarketToken[];
  events?: Array<{ slug?: string }>;
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

const normalizeOutcome = (token: PolymarketToken, index: number): NormalizedExternalOutcome => {
  const title = token.outcome?.trim() || `Outcome ${index + 1}`;
  const normalized = title.toLowerCase();
  return {
    externalOutcomeId: token.token_id ?? token.tokenId ?? `${index}`,
    title,
    slug: normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    outcomeIndex: index,
    yesNo: normalized === "yes" ? "yes" : normalized === "no" ? "no" : null,
    bestBid: parseNumber(token.bestBid),
    bestAsk: parseNumber(token.bestAsk),
    lastPrice: parseNumber(token.price),
    volume: parseNumber(token.volume),
  };
};

const buildRecentTrades = (outcomes: readonly NormalizedExternalOutcome[]): NormalizedExternalTradeTick[] =>
  outcomes
    .filter((outcome) => outcome.lastPrice !== null)
    .slice(0, 4)
    .map((outcome, index) => ({
      tradeId: `${outcome.externalOutcomeId}:${index}`,
      outcomeExternalId: outcome.externalOutcomeId,
      side: null,
      price: outcome.lastPrice ?? 0,
      size: null,
      tradedAt: null,
    }));

const mapMarket = (market: PolymarketMarket): NormalizedExternalMarket | null => {
  if (market.id === undefined || !market.question) {
    return null;
  }

  const outcomes = (market.tokens ?? []).map(normalizeOutcome);
  const bestBidFromOutcomes = outcomes.map((item) => item.bestBid).find((item) => item !== null) ?? null;
  const bestAskFromOutcomes = outcomes.map((item) => item.bestAsk).find((item) => item !== null) ?? null;

  const active = market.active !== false;
  const closed = market.closed === true;

  return {
    source: "polymarket",
    externalId: String(market.id),
    slug:
      market.slug ?? market.events?.[0]?.slug ?? market.question.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: market.question,
    description: market.description ?? "",
    url: market.url ?? (market.slug ? `https://polymarket.com/event/${market.slug}` : null),
    status: closed ? "closed" : active ? "open" : "cancelled",
    closeTime: toIsoOrNull(market.closedTime),
    endTime: toIsoOrNull(market.endDate ?? market.end_date_iso),
    resolvedAt: toIsoOrNull(market.resolved_at),
    bestBid: parseNumber(market.bestBid) ?? bestBidFromOutcomes,
    bestAsk: parseNumber(market.bestAsk) ?? bestAskFromOutcomes,
    lastTradePrice: parseNumber(market.lastTradePrice) ?? outcomes[0]?.lastPrice ?? null,
    volume24h: parseNumber(market.volume24hr),
    volumeTotal: parseNumber(market.volume),
    outcomes,
    recentTrades: buildRecentTrades(outcomes),
    rawPayload: market,
  };
};

export const createPolymarketAdapter = (): ExternalMarketAdapter => ({
  source: "polymarket",
  async listMarkets(): Promise<NormalizedExternalMarket[]> {
    const response = await fetch(`${GAMMA_BASE_URL}/markets?limit=100&active=true`, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Polymarket gamma request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((entry) => mapMarket(entry as PolymarketMarket))
      .filter((entry): entry is NormalizedExternalMarket => entry !== null);
  },
});
