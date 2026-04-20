import type {
  Market,
  MarketSnapshot,
  MarketStats,
  MarketTrades,
  OrderBook,
  OrderBookLevel,
  Outcome,
  RecentTrade,
} from "@bet/contracts";
import { createDatabaseClient } from "@bet/db";

interface MarketRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: Market["status"];
  collateral_currency: string;
  min_price: bigint;
  max_price: bigint;
  tick_size: bigint;
  close_time: Date | string | null;
  resolve_time: Date | string | null;
  created_at: Date | string;
}

interface OutcomeRow {
  id: string;
  market_id: string;
  slug: string;
  title: string;
  outcome_index: number;
  created_at: Date | string;
}

interface MarketOrderStatsRow {
  market_id: string;
  best_bid: bigint | null;
  best_ask: bigint | null;
}

interface MarketTradeStatsRow {
  market_id: string;
  last_trade_price: bigint | null;
  volume_notional: bigint;
}

interface OrderBookLevelRow {
  outcome_id: string;
  side: OrderBookLevel["side"];
  price_ticks: bigint;
  quantity_atoms: bigint;
}

interface RecentTradeRow {
  id: string;
  outcome_id: string;
  price_ticks: bigint;
  quantity_atoms: bigint;
  taker_side: RecentTrade["takerSide"];
  executed_at: Date | string;
}

const db = createDatabaseClient();

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIsoString = (value: Date | string | null): string | null =>
  value ? toIsoString(value) : null;

const mapOutcome = (row: OutcomeRow): Outcome => ({
  id: row.id,
  marketId: row.market_id,
  slug: row.slug,
  title: row.title,
  index: row.outcome_index,
  createdAt: toIsoString(row.created_at),
});

const mapMarket = (row: MarketRow, outcomes: Outcome[]): Market => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: row.status,
  collateralCurrency: row.collateral_currency,
  minPrice: row.min_price,
  maxPrice: row.max_price,
  tickSize: row.tick_size,
  createdAt: toIsoString(row.created_at),
  closesAt: toNullableIsoString(row.close_time),
  resolvesAt: toNullableIsoString(row.resolve_time),
  outcomes,
});

const buildDefaultMarketStats = (): MarketStats => ({
  bestBid: null,
  bestAsk: null,
  lastTradePrice: null,
  volumeNotional: 0n,
});

const listMarketStats = async (marketIds: readonly string[]): Promise<Map<string, MarketStats>> => {
  const statsByMarketId = new Map<string, MarketStats>();

  for (const marketId of marketIds) {
    statsByMarketId.set(marketId, buildDefaultMarketStats());
  }

  if (marketIds.length === 0) {
    return statsByMarketId;
  }

  const [orderRows, tradeRows] = await Promise.all([
    db.query<MarketOrderStatsRow>(
      `
        select
          market_id,
          max(price) filter (where side = 'buy') as best_bid,
          min(price) filter (where side = 'sell') as best_ask
        from public.orders
        where market_id = any($1::uuid[])
          and status in ('open', 'partially_filled')
          and remaining_quantity > 0
        group by market_id
      `,
      [marketIds],
    ),
    db.query<MarketTradeStatsRow>(
      `
        with last_trades as (
          select distinct on (market_id)
            market_id,
            price as last_trade_price
          from public.trades
          where market_id = any($1::uuid[])
          order by market_id asc, matched_at desc, sequence desc
        ),
        trade_volumes as (
          select
            market_id,
            coalesce(sum(notional), 0::bigint) as volume_notional
          from public.trades
          where market_id = any($1::uuid[])
          group by market_id
        )
        select
          coalesce(last_trades.market_id, trade_volumes.market_id) as market_id,
          last_trades.last_trade_price,
          coalesce(trade_volumes.volume_notional, 0::bigint) as volume_notional
        from last_trades
        full outer join trade_volumes on trade_volumes.market_id = last_trades.market_id
      `,
      [marketIds],
    ),
  ]);

  for (const row of orderRows) {
    statsByMarketId.set(row.market_id, {
      ...(statsByMarketId.get(row.market_id) ?? buildDefaultMarketStats()),
      bestBid: row.best_bid,
      bestAsk: row.best_ask,
    });
  }

  for (const row of tradeRows) {
    statsByMarketId.set(row.market_id, {
      ...(statsByMarketId.get(row.market_id) ?? buildDefaultMarketStats()),
      lastTradePrice: row.last_trade_price,
      volumeNotional: row.volume_notional,
    });
  }

  return statsByMarketId;
};

const listOutcomeRows = async (marketIds: readonly string[]): Promise<OutcomeRow[]> => {
  if (marketIds.length === 0) {
    return [];
  }

  return db.query<OutcomeRow>(
    `
      select id, market_id, slug, title, outcome_index, created_at
      from public.outcomes
      where market_id = any($1::uuid[])
      order by market_id asc, outcome_index asc
    `,
    [marketIds],
  );
};

export const listMarketRecords = async (): Promise<MarketSnapshot[]> => {
  const marketRows = await db.query<MarketRow>(
    `
      select
        id,
        slug,
        title,
        description,
        status,
        collateral_currency,
        min_price,
        max_price,
        tick_size,
        close_time,
        resolve_time,
        created_at
      from public.markets
      order by created_at desc, id asc
    `,
  );

  const outcomeRows = await listOutcomeRows(marketRows.map((market) => market.id));
  const statsByMarketId = await listMarketStats(marketRows.map((market) => market.id));
  const outcomesByMarketId = new Map<string, Outcome[]>();

  for (const row of outcomeRows) {
    const outcomes = outcomesByMarketId.get(row.market_id) ?? [];
    outcomes.push(mapOutcome(row));
    outcomesByMarketId.set(row.market_id, outcomes);
  }

  return marketRows.map((row) => ({
    ...mapMarket(row, outcomesByMarketId.get(row.id) ?? []),
    stats: statsByMarketId.get(row.id) ?? buildDefaultMarketStats(),
  }));
};

export const getMarketRecordById = async (marketId: string): Promise<MarketSnapshot | null> => {
  const [marketRow] = await db.query<MarketRow>(
    `
      select
        id,
        slug,
        title,
        description,
        status,
        collateral_currency,
        min_price,
        max_price,
        tick_size,
        close_time,
        resolve_time,
        created_at
      from public.markets
      where id = $1::uuid
      limit 1
    `,
    [marketId],
  );

  if (!marketRow) {
    return null;
  }

  const outcomeRows = await listOutcomeRows([marketId]);
  const statsByMarketId = await listMarketStats([marketId]);

  return {
    ...mapMarket(
      marketRow,
      outcomeRows.map((row) => mapOutcome(row)),
    ),
    stats: statsByMarketId.get(marketId) ?? buildDefaultMarketStats(),
  };
};

export const getMarketOrderBook = async (marketId: string): Promise<OrderBook> => {
  const rows = await db.query<OrderBookLevelRow>(
    `
      select
        outcome_id,
        side,
        price as price_ticks,
        sum(remaining_quantity)::bigint as quantity_atoms
      from public.orders
      where market_id = $1::uuid
        and status in ('open', 'partially_filled')
        and remaining_quantity > 0
      group by outcome_id, side, price
      order by
        outcome_id asc,
        case when side = 'buy' then 0 else 1 end asc,
        case when side = 'buy' then price end desc,
        case when side = 'sell' then price end asc
    `,
    [marketId],
  );

  return {
    marketId,
    levels: rows.map((row) => ({
      outcomeId: row.outcome_id,
      side: row.side,
      priceTicks: row.price_ticks,
      quantityAtoms: row.quantity_atoms,
    })),
  };
};

const RECENT_TRADES_LIMIT = 50;

export const getRecentMarketTrades = async (
  marketId: string,
  limit = RECENT_TRADES_LIMIT,
): Promise<MarketTrades> => {
  const rows = await db.query<RecentTradeRow>(
    `
      select
        t.id,
        t.outcome_id,
        t.price as price_ticks,
        t.quantity as quantity_atoms,
        taker_order.side as taker_side,
        t.matched_at as executed_at
      from public.trades t
      left join public.orders taker_order on taker_order.id = t.taker_order_id
      where t.market_id = $1::uuid
      order by t.matched_at desc, t.sequence desc
      limit $2
    `,
    [marketId, limit],
  );

  return {
    marketId,
    trades: rows.map((row) => ({
      id: row.id,
      outcomeId: row.outcome_id,
      priceTicks: row.price_ticks,
      quantityAtoms: row.quantity_atoms,
      takerSide: row.taker_side,
      executedAt: toIsoString(row.executed_at),
    })),
  };
};
