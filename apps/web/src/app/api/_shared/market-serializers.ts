export type MarketRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  collateral_currency: string;
  min_price: string | number | bigint | null;
  max_price: string | number | bigint | null;
  tick_size: string | number | bigint | null;
  close_time: string | Date | null;
  resolve_time: string | Date | null;
  created_at: string | Date;
};

export type OutcomeRow = {
  id: string;
  market_id: string;
  slug: string;
  title: string;
  outcome_index: number;
  created_at: string | Date;
};

const toIso = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
};

const toStringAmount = (value: string | number | bigint | null | undefined): string => {
  if (value === null || value === undefined) {
    return "0";
  }

  return String(value);
};

export const serializeOutcome = (row: OutcomeRow) => ({
  id: row.id,
  marketId: row.market_id,
  slug: row.slug,
  title: row.title,
  index: row.outcome_index,
  createdAt: toIso(row.created_at),
});

export const serializeMarketSnapshot = (row: MarketRow, outcomes: OutcomeRow[]) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: row.status,
  collateralCurrency: row.collateral_currency,
  minPrice: toStringAmount(row.min_price),
  maxPrice: toStringAmount(row.max_price),
  tickSize: toStringAmount(row.tick_size),
  createdAt: toIso(row.created_at),
  closesAt: toIso(row.close_time),
  resolvesAt: toIso(row.resolve_time),
  outcomes: outcomes.map(serializeOutcome),
  stats: {
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    volumeNotional: "0",
  },
});

export const serializeOrderBookResponse = (marketId: string, payload: unknown) => {
  const source = payload && typeof payload === "object" ? (payload as { marketId?: unknown; levels?: unknown }) : {};
  const levels = Array.isArray(source.levels) ? source.levels : [];

  return {
    marketId: typeof source.marketId === "string" ? source.marketId : marketId,
    levels: levels
      .filter((level): level is Record<string, unknown> => Boolean(level && typeof level === "object"))
      .map((level) => ({
        outcomeId: String(level.outcomeId ?? ""),
        side: String(level.side ?? "buy"),
        priceTicks: toStringAmount(level.priceTicks as string | number | bigint | null | undefined),
        quantityAtoms: toStringAmount(level.quantityAtoms as string | number | bigint | null | undefined),
      })),
  };
};

export const serializeTradesResponse = (marketId: string, payload: unknown) => {
  const source = payload && typeof payload === "object" ? (payload as { marketId?: unknown; trades?: unknown }) : {};
  const trades = Array.isArray(source.trades) ? source.trades : [];

  return {
    marketId: typeof source.marketId === "string" ? source.marketId : marketId,
    trades: trades
      .filter((trade): trade is Record<string, unknown> => Boolean(trade && typeof trade === "object"))
      .map((trade) => ({
        id: String(trade.id ?? ""),
        outcomeId: String(trade.outcomeId ?? ""),
        priceTicks: toStringAmount(trade.priceTicks as string | number | bigint | null | undefined),
        quantityAtoms: toStringAmount(trade.quantityAtoms as string | number | bigint | null | undefined),
        takerSide: trade.takerSide === null || trade.takerSide === undefined ? null : String(trade.takerSide),
        executedAt: toIso(trade.executedAt as string | Date | null | undefined),
      })),
  };
};
