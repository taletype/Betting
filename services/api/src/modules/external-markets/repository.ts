import { createDatabaseClient, type DatabaseExecutor } from "@bet/db";

interface ExternalMarketRow {
  id: string;
  source: "polymarket" | "kalshi";
  external_id: string;
  slug: string;
  title: string;
  description: string;
  status: "open" | "closed" | "resolved" | "cancelled";
  market_url: string | null;
  close_time: Date | string | null;
  end_time: Date | string | null;
  resolved_at: Date | string | null;
  best_bid: number | string | null;
  best_ask: number | string | null;
  last_trade_price: number | string | null;
  volume_24h: number | string | null;
  volume_total: number | string | null;
  last_synced_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ExternalOutcomeRow {
  external_market_id: string;
  external_outcome_id: string;
  title: string;
  slug: string;
  outcome_index: number;
  yes_no: "yes" | "no" | null;
  best_bid: number | string | null;
  best_ask: number | string | null;
  last_price: number | string | null;
  volume: number | string | null;
}

interface ExternalTradeRow {
  external_market_id: string;
  external_trade_id: string;
  external_outcome_id: string | null;
  side: "buy" | "sell" | null;
  price: number | string;
  size: number | string | null;
  traded_at: Date | string;
}

const defaultDb = createDatabaseClient();

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIsoString = (value: Date | string | null): string | null =>
  value ? toIsoString(value) : null;

const toNumber = (value: string | number | null): number | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface ExternalOutcomeView {
  externalOutcomeId: string;
  title: string;
  slug: string;
  index: number;
  yesNo: "yes" | "no" | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
  volume: number | null;
}

export interface ExternalTradeView {
  externalTradeId: string;
  externalOutcomeId: string | null;
  side: "buy" | "sell" | null;
  price: number | null;
  size: number | null;
  tradedAt: string;
}

export interface ExternalMarketView {
  id: string;
  source: "polymarket" | "kalshi";
  externalId: string;
  slug: string;
  title: string;
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
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  outcomes: ExternalOutcomeView[];
  recentTrades: ExternalTradeView[];
}

const mapMarket = (row: ExternalMarketRow): ExternalMarketView => ({
  id: row.id,
  source: row.source,
  externalId: row.external_id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: row.status,
  marketUrl: row.market_url,
  closeTime: toNullableIsoString(row.close_time),
  endTime: toNullableIsoString(row.end_time),
  resolvedAt: toNullableIsoString(row.resolved_at),
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
  lastTradePrice: toNumber(row.last_trade_price),
  volume24h: toNumber(row.volume_24h),
  volumeTotal: toNumber(row.volume_total),
  lastSyncedAt: toNullableIsoString(row.last_synced_at),
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  outcomes: [],
  recentTrades: [],
});

const mapOutcome = (row: ExternalOutcomeRow): ExternalOutcomeView => ({
  externalOutcomeId: row.external_outcome_id,
  title: row.title,
  slug: row.slug,
  index: row.outcome_index,
  yesNo: row.yes_no,
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
  lastPrice: toNumber(row.last_price),
  volume: toNumber(row.volume),
});

const mapTrade = (row: ExternalTradeRow): ExternalTradeView => ({
  externalTradeId: row.external_trade_id,
  externalOutcomeId: row.external_outcome_id,
  side: row.side,
  price: toNumber(row.price),
  size: toNumber(row.size),
  tradedAt: toIsoString(row.traded_at),
});

export const createExternalMarketsRepository = (database: DatabaseExecutor) => {
  const attachChildren = async (marketRecords: ExternalMarketView[]): Promise<ExternalMarketView[]> => {
    if (marketRecords.length === 0) {
      return marketRecords;
    }

    const ids = marketRecords.map((market) => market.id);

    const [outcomeRows, tradeRows] = await Promise.all([
      database.query<ExternalOutcomeRow>(
        `
          select
            external_market_id,
            external_outcome_id,
            title,
            slug,
            outcome_index,
            yes_no,
            best_bid,
            best_ask,
            last_price,
            volume
          from public.external_outcomes
          where external_market_id = any($1::uuid[])
          order by external_market_id asc, outcome_index asc
        `,
        [ids],
      ),
      database.query<ExternalTradeRow>(
        `
          select
            external_market_id,
            external_trade_id,
            external_outcome_id,
            side,
            price,
            size,
            traded_at
          from public.external_trade_ticks
          where external_market_id = any($1::uuid[])
          order by external_market_id asc, traded_at desc
        `,
        [ids],
      ),
    ]);

    const byMarket = new Map(marketRecords.map((market) => [market.id, market]));

    for (const row of outcomeRows) {
      byMarket.get(row.external_market_id)?.outcomes.push(mapOutcome(row));
    }

    const tradeCountByMarket = new Map<string, number>();
    for (const row of tradeRows) {
      const current = tradeCountByMarket.get(row.external_market_id) ?? 0;
      if (current < 20) {
        byMarket.get(row.external_market_id)?.recentTrades.push(mapTrade(row));
        tradeCountByMarket.set(row.external_market_id, current + 1);
      }
    }

    return marketRecords;
  };

  const listExternalMarketRecords = async (): Promise<ExternalMarketView[]> => {
    const rows = await database.query<ExternalMarketRow>(
      `
        select
          id,
          source,
          external_id,
          slug,
          title,
          description,
          status,
          market_url,
          close_time,
          end_time,
          resolved_at,
          best_bid,
          best_ask,
          last_trade_price,
          volume_24h,
          volume_total,
          last_synced_at,
          created_at,
          updated_at
        from public.external_markets
        order by last_synced_at desc nulls last, updated_at desc, id asc
        limit 500
      `,
    );

    return attachChildren(rows.map(mapMarket));
  };

  const getExternalMarketRecord = async (source: string, externalId: string): Promise<ExternalMarketView | null> => {
    const [row] = await database.query<ExternalMarketRow>(
      `
        select
          id,
          source,
          external_id,
          slug,
          title,
          description,
          status,
          market_url,
          close_time,
          end_time,
          resolved_at,
          best_bid,
          best_ask,
          last_trade_price,
          volume_24h,
          volume_total,
          last_synced_at,
          created_at,
          updated_at
        from public.external_markets
        where source = $1 and external_id = $2
        limit 1
      `,
      [source, externalId],
    );

    if (!row) {
      return null;
    }

    const [market] = await attachChildren([mapMarket(row)]);
    return market;
  };

  return {
    listExternalMarketRecords,
    getExternalMarketRecord,
  };
};

const repository = createExternalMarketsRepository(defaultDb);
let repositoryOverride: ReturnType<typeof createExternalMarketsRepository> | null = null;

export const setExternalMarketsRepositoryForTests = (
  override: ReturnType<typeof createExternalMarketsRepository> | null,
): void => {
  repositoryOverride = override;
};

export const listExternalMarketRecords = async (): Promise<ExternalMarketView[]> =>
  (repositoryOverride ?? repository).listExternalMarketRecords();

export const getExternalMarketRecord = async (source: string, externalId: string): Promise<ExternalMarketView | null> =>
  (repositoryOverride ?? repository).getExternalMarketRecord(source, externalId);
