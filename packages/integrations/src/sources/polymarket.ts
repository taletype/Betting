import type {
  ExternalMarketAdapter,
  NormalizedExternalMarket,
  NormalizedExternalOutcome,
  NormalizedExternalTradeTick,
} from "../index";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DATA_BASE_URL = "https://data-api.polymarket.com";

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
  conditionId?: string;
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
  outcomes?: string | string[];
  outcomePrices?: string | number[] | string[];
  clobTokenIds?: string | string[];
  tokens?: PolymarketToken[];
  events?: Array<{ slug?: string }>;
}

interface PolymarketTrade {
  conditionId?: string;
  side?: string;
  size?: number | string;
  price?: number | string;
  timestamp?: number | string;
  outcome?: string;
  outcomeIndex?: number;
  transactionHash?: string;
  asset?: string;
}

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry));
    }
  } catch {
    // Fall through to comma-separated fallback.
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const toIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeOutcome = (token: PolymarketToken, index: number): NormalizedExternalOutcome => {
  const title = token.outcome?.trim() || `Outcome ${index + 1}`;
  const normalized = title.toLowerCase();
  return {
    externalOutcomeId: token.token_id ?? token.tokenId ?? `${index}`,
    title,
    slug: normalizeSlug(title),
    outcomeIndex: index,
    yesNo: normalized === "yes" ? "yes" : normalized === "no" ? "no" : null,
    bestBid: parseNumber(token.bestBid),
    bestAsk: parseNumber(token.bestAsk),
    lastPrice: parseNumber(token.price),
    volume: parseNumber(token.volume),
  };
};

const buildOutcomes = (market: PolymarketMarket): NormalizedExternalOutcome[] => {
  if ((market.tokens ?? []).length > 0) {
    return (market.tokens ?? []).map(normalizeOutcome);
  }

  const outcomeTitles = parseStringArray(market.outcomes);
  const outcomePrices = parseStringArray(market.outcomePrices).map((value) => parseNumber(value));
  const tokenIds = parseStringArray(market.clobTokenIds);

  return outcomeTitles.map((title, index) => {
    const normalized = title.toLowerCase();
    return {
      externalOutcomeId: tokenIds[index] ?? `${index}`,
      title,
      slug: normalizeSlug(title),
      outcomeIndex: index,
      yesNo: normalized === "yes" ? "yes" : normalized === "no" ? "no" : null,
      bestBid: null,
      bestAsk: null,
      lastPrice: outcomePrices[index] ?? null,
      volume: null,
    };
  });
};

const toTradeSide = (value: unknown): "buy" | "sell" | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "buy") {
    return "buy";
  }
  if (normalized === "sell") {
    return "sell";
  }
  return null;
};

const toTradeTimestamp = (value: unknown): string | null => {
  const numericValue = parseNumber(value);
  if (numericValue === null) {
    return null;
  }

  const milliseconds = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const mapTrade = (
  trade: PolymarketTrade,
  outcomes: readonly NormalizedExternalOutcome[],
): NormalizedExternalTradeTick | null => {
  const price = parseNumber(trade.price);
  if (price === null) {
    return null;
  }

  const indexedOutcome =
    typeof trade.outcomeIndex === "number" ? outcomes[trade.outcomeIndex] : undefined;
  const namedOutcome = typeof trade.outcome === "string"
    ? outcomes.find((outcome) => outcome.title.toLowerCase() === trade.outcome?.trim().toLowerCase())
    : undefined;
  const outcomeExternalId = indexedOutcome?.externalOutcomeId ?? namedOutcome?.externalOutcomeId ?? trade.asset ?? null;
  const tradedAt = toTradeTimestamp(trade.timestamp);

  return {
    tradeId:
      trade.transactionHash ??
      `${trade.conditionId ?? "unknown"}:${trade.outcomeIndex ?? "na"}:${trade.timestamp ?? "na"}:${price}`,
    outcomeExternalId,
    side: toTradeSide(trade.side),
    price,
    size: parseNumber(trade.size),
    tradedAt,
  };
};

const attachRecentTrades = async (
  markets: readonly NormalizedExternalMarket[],
): Promise<NormalizedExternalMarket[]> => {
  const conditionIds = markets
    .map((market) => {
      const payload = market.rawPayload as PolymarketMarket;
      return payload.conditionId;
    })
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (conditionIds.length === 0) {
    return [...markets];
  }

  const searchParams = new URLSearchParams({
    market: conditionIds.join(","),
    limit: "500",
    offset: "0",
    takerOnly: "true",
  });
  const response = await fetch(`${DATA_BASE_URL}/trades?${searchParams.toString()}`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Polymarket data trades request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    return [...markets];
  }

  const tradesByConditionId = new Map<string, PolymarketTrade[]>();
  for (const entry of payload) {
    const trade = entry as PolymarketTrade;
    if (!trade.conditionId) {
      continue;
    }

    const current = tradesByConditionId.get(trade.conditionId) ?? [];
    current.push(trade);
    tradesByConditionId.set(trade.conditionId, current);
  }

  return markets.map((market) => {
    const conditionId = (market.rawPayload as PolymarketMarket).conditionId;
    const recentTrades = (conditionId ? tradesByConditionId.get(conditionId) : undefined) ?? [];

    return {
      ...market,
      recentTrades: recentTrades
        .map((trade) => mapTrade(trade, market.outcomes))
        .filter((trade): trade is NormalizedExternalTradeTick => trade !== null)
        .slice(0, 20),
    };
  });
};

const mapMarket = (market: PolymarketMarket): NormalizedExternalMarket | null => {
  if (market.id === undefined || !market.question) {
    return null;
  }

  const outcomes = buildOutcomes(market);
  const bestBidFromOutcomes = outcomes.map((item) => item.bestBid).find((item) => item !== null) ?? null;
  const bestAskFromOutcomes = outcomes.map((item) => item.bestAsk).find((item) => item !== null) ?? null;

  const active = market.active !== false;
  const closed = market.closed === true;
  const resolvedAt = toIsoOrNull(market.resolved_at);

  return {
    source: "polymarket",
    externalId: String(market.id),
    slug:
      market.slug ?? market.events?.[0]?.slug ?? normalizeSlug(market.question),
    title: market.question,
    description: market.description ?? "",
    url: market.url ?? (market.slug ? `https://polymarket.com/event/${market.slug}` : null),
    status: resolvedAt ? "resolved" : closed ? "closed" : active ? "open" : "cancelled",
    closeTime: toIsoOrNull(market.closedTime),
    endTime: toIsoOrNull(market.endDate ?? market.end_date_iso),
    resolvedAt,
    bestBid: parseNumber(market.bestBid) ?? bestBidFromOutcomes,
    bestAsk: parseNumber(market.bestAsk) ?? bestAskFromOutcomes,
    lastTradePrice: parseNumber(market.lastTradePrice) ?? outcomes[0]?.lastPrice ?? null,
    volume24h: parseNumber(market.volume24hr),
    volumeTotal: parseNumber(market.volume),
    outcomes,
    recentTrades: [],
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

    const markets = payload
      .map((entry) => mapMarket(entry as PolymarketMarket))
      .filter((entry): entry is NormalizedExternalMarket => entry !== null);

    return attachRecentTrades(markets);
  },
});
