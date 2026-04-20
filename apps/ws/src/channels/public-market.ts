import {
  MarketTradesSchema,
  OrderBookSchema,
  type MarketTrades,
  type OrderBook,
  type PublicMarketChannel,
  type PublicWebsocketEvent,
} from "@bet/contracts";
import { createDatabaseClient } from "@bet/db";

interface OrderBookLevelRow {
  outcome_id: string;
  side: "buy" | "sell";
  price_ticks: bigint;
  quantity_atoms: bigint;
}

interface RecentTradeRow {
  id: string;
  outcome_id: string;
  price_ticks: bigint;
  quantity_atoms: bigint;
  taker_side: "buy" | "sell" | null;
  executed_at: Date | string;
}

interface MarketSequenceRow {
  sequence: bigint;
}

export interface PublicMarketSnapshot {
  marketId: string;
  orderbook: OrderBook;
  sequence: bigint;
  trades: MarketTrades;
}

const db = createDatabaseClient();

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

// Keep these queries aligned with the HTTP market endpoints.
export const loadPublicMarketSnapshot = async (marketId: string): Promise<PublicMarketSnapshot> =>
  db.transaction(async (transaction) => {
    await transaction.query("set transaction isolation level repeatable read");

    const [orderbookRows, tradeRows, sequenceRows] = await Promise.all([
      transaction.query<OrderBookLevelRow>(
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
      ),
      transaction.query<RecentTradeRow>(
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
          limit 50
        `,
        [marketId],
      ),
      transaction.query<MarketSequenceRow>(
        `
          select coalesce(sequence, 0::bigint) as sequence
          from public.market_realtime_sequences
          where market_id = $1::uuid
          limit 1
        `,
        [marketId],
      ),
    ]);

    const orderbook = OrderBookSchema.parse({
      marketId,
      levels: orderbookRows.map((row) => ({
        outcomeId: row.outcome_id,
        priceTicks: row.price_ticks,
        quantityAtoms: row.quantity_atoms,
        side: row.side,
      })),
    });

    const trades = MarketTradesSchema.parse({
      marketId,
      trades: tradeRows.map((row) => ({
        executedAt: toIsoString(row.executed_at),
        id: row.id,
        outcomeId: row.outcome_id,
        priceTicks: row.price_ticks,
        quantityAtoms: row.quantity_atoms,
        takerSide: row.taker_side,
      })),
    });

    return {
      marketId,
      orderbook,
      sequence: sequenceRows[0]?.sequence ?? 0n,
      trades,
    };
  });

export const loadPublicOrderbook = async (marketId: string): Promise<OrderBook> => {
  const snapshot = await loadPublicMarketSnapshot(marketId);
  return snapshot.orderbook;
};

export const createPublicMarketSnapshotEvents = (
  snapshot: PublicMarketSnapshot,
  channels: ReadonlySet<PublicMarketChannel>,
): PublicWebsocketEvent[] => {
  const events: PublicWebsocketEvent[] = [];

  if (channels.has("orderbook")) {
    events.push({
      type: "market.orderbook.snapshot",
      marketId: snapshot.marketId,
      orderbook: snapshot.orderbook,
      sequence: snapshot.sequence,
    });
  }

  if (channels.has("trades")) {
    events.push({
      type: "market.trades.snapshot",
      marketId: snapshot.marketId,
      sequence: snapshot.sequence,
      trades: snapshot.trades,
    });
  }

  return events;
};

export const eventMatchesPublicMarketChannels = (
  event: PublicWebsocketEvent,
  channels: ReadonlySet<PublicMarketChannel>,
): boolean => {
  if (event.type === "market.orderbook.snapshot" || event.type === "market.orderbook.delta") {
    return channels.has("orderbook");
  }

  if (event.type === "market.trades.snapshot" || event.type === "market.trade.executed") {
    return channels.has("trades");
  }

  return true;
};
