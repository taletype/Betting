import type { Order } from "@bet/contracts";
import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";
import type { LedgerMutationResult } from "@bet/ledger";

interface MarketOutcomeRow {
  market_id: string;
  market_status: "draft" | "open" | "halted" | "resolved" | "cancelled";
  outcome_id: string;
}

interface OrderRow {
  id: string;
  user_id: string;
  market_id: string;
  outcome_id: string;
  side: Order["side"];
  order_type: Order["orderType"];
  status: Order["status"];
  price: bigint;
  quantity: bigint;
  remaining_quantity: bigint;
  reserved_amount: bigint;
  client_order_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PositionRow {
  id: string;
  user_id: string;
  market_id: string;
  outcome_id: string;
  net_quantity: bigint;
  average_entry_price: bigint;
  realized_pnl: bigint;
  updated_at: Date | string;
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapOrderRow = (row: OrderRow): Order => ({
  id: row.id,
  marketId: row.market_id,
  outcomeId: row.outcome_id,
  userId: row.user_id,
  side: row.side,
  orderType: row.order_type,
  status: row.status,
  price: row.price,
  quantity: row.quantity,
  remainingQuantity: row.remaining_quantity,
  reservedAmount: row.reserved_amount,
  clientOrderId: row.client_order_id,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
});

export interface MarketSelection {
  marketId: string;
  marketStatus: MarketOutcomeRow["market_status"];
  outcomeId: string;
}

export interface TradeInsertInput {
  id: string;
  marketId: string;
  outcomeId: string;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  price: bigint;
  quantity: bigint;
  notional: bigint;
  sequence: bigint;
  matchedAt: string;
}

export interface PositionState {
  id: string;
  userId: string;
  marketId: string;
  outcomeId: string;
  netQuantity: bigint;
  averageEntryPrice: bigint;
  realizedPnl: bigint;
  updatedAt: string;
}

export const getMarketSelection = async (
  executor: DatabaseExecutor,
  input: { marketId: string; outcomeId: string },
): Promise<MarketSelection | null> => {
  const [row] = await executor.query<MarketOutcomeRow>(
    `
      select
        m.id as market_id,
        m.status as market_status,
        o.id as outcome_id
      from public.markets m
      join public.outcomes o on o.market_id = m.id
      where m.id = $1::uuid
        and o.id = $2::uuid
      limit 1
    `,
    [input.marketId, input.outcomeId],
  );

  if (!row) {
    return null;
  }

  return {
    marketId: row.market_id,
    marketStatus: row.market_status,
    outcomeId: row.outcome_id,
  };
};

export const insertOrder = async (
  transaction: DatabaseTransaction,
  order: Order,
): Promise<void> => {
  await transaction.query(
    `
      insert into public.orders (
        id,
        user_id,
        market_id,
        outcome_id,
        side,
        order_type,
        status,
        price,
        quantity,
        remaining_quantity,
        reserved_amount,
        client_order_id,
        created_at,
        updated_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13::timestamptz,
        $14::timestamptz
      )
    `,
    [
      order.id,
      order.userId,
      order.marketId,
      order.outcomeId,
      order.side,
      order.orderType,
      order.status,
      order.price,
      order.quantity,
      order.remainingQuantity,
      order.reservedAmount,
      order.clientOrderId,
      order.createdAt,
      order.updatedAt,
    ],
  );
};

export const getOrderForUpdate = async (
  transaction: DatabaseTransaction,
  orderId: string,
): Promise<Order | null> => {
  const [row] = await transaction.query<OrderRow>(
    `
      select
        id,
        user_id,
        market_id,
        outcome_id,
        side,
        order_type,
        status,
        price,
        quantity,
        remaining_quantity,
        reserved_amount,
        client_order_id,
        created_at,
        updated_at
      from public.orders
      where id = $1::uuid
      limit 1
      for update
    `,
    [orderId],
  );

  return row ? mapOrderRow(row) : null;
};

export const listOpenOrdersForUser = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<Order[]> => {
  const rows = await executor.query<OrderRow>(
    `
      select
        id,
        user_id,
        market_id,
        outcome_id,
        side,
        order_type,
        status,
        price,
        quantity,
        remaining_quantity,
        reserved_amount,
        client_order_id,
        created_at,
        updated_at
      from public.orders
      where user_id = $1::uuid
        and status in ('open', 'partially_filled')
      order by created_at desc, id desc
    `,
    [userId],
  );

  return rows.map((row) => mapOrderRow(row));
};

export const listMatchableRestingOrders = async (
  transaction: DatabaseTransaction,
  input: {
    orderId: string;
    marketId: string;
    outcomeId: string;
    incomingSide: Order["side"];
    price: bigint;
  },
): Promise<Order[]> => {
  const rows = await transaction.query<OrderRow>(
    `
      select
        id,
        user_id,
        market_id,
        outcome_id,
        side,
        order_type,
        status,
        price,
        quantity,
        remaining_quantity,
        reserved_amount,
        client_order_id,
        created_at,
        updated_at
      from public.orders
      where id <> $1::uuid
        and market_id = $2::uuid
        and outcome_id = $3::uuid
        and side <> $4
        and status in ('open', 'partially_filled')
        and (
          ($4 = 'buy' and price <= $5)
          or ($4 = 'sell' and price >= $5)
        )
      order by
        case when $4 = 'buy' then price end asc,
        case when $4 = 'sell' then price end desc,
        created_at asc,
        id asc
      for update
    `,
    [input.orderId, input.marketId, input.outcomeId, input.incomingSide, input.price],
  );

  return rows.map((row) => mapOrderRow(row));
};

export const updateOrder = async (
  transaction: DatabaseTransaction,
  order: Order,
): Promise<void> => {
  await transaction.query(
    `
      update public.orders
      set status = $2,
          remaining_quantity = $3,
          reserved_amount = $4,
          updated_at = $5::timestamptz
      where id = $1::uuid
    `,
    [order.id, order.status, order.remainingQuantity, order.reservedAmount, order.updatedAt],
  );
};

export const lockTradeSequenceForMarket = async (
  transaction: DatabaseTransaction,
  marketId: string,
): Promise<void> => {
  await transaction.query("select pg_advisory_xact_lock(hashtext($1))", [marketId]);
};

export const getNextTradeSequence = async (
  transaction: DatabaseTransaction,
  marketId: string,
): Promise<bigint> => {
  const [row] = await transaction.query<{ max_sequence: bigint | null }>(
    `
      select max(sequence)::bigint as max_sequence
      from public.trades
      where market_id = $1::uuid
    `,
    [marketId],
  );

  return (row?.max_sequence ?? 0n) + 1n;
};

export const insertTrade = async (
  transaction: DatabaseTransaction,
  trade: TradeInsertInput,
): Promise<void> => {
  await transaction.query(
    `
      insert into public.trades (
        id,
        market_id,
        outcome_id,
        maker_order_id,
        taker_order_id,
        maker_user_id,
        taker_user_id,
        price,
        quantity,
        notional,
        sequence,
        matched_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5::uuid,
        $6::uuid,
        $7::uuid,
        $8,
        $9,
        $10,
        $11,
        $12::timestamptz
      )
    `,
    [
      trade.id,
      trade.marketId,
      trade.outcomeId,
      trade.makerOrderId,
      trade.takerOrderId,
      trade.makerUserId,
      trade.takerUserId,
      trade.price,
      trade.quantity,
      trade.notional,
      trade.sequence,
      trade.matchedAt,
    ],
  );
};

const mapPositionRow = (row: PositionRow): PositionState => ({
  id: row.id,
  userId: row.user_id,
  marketId: row.market_id,
  outcomeId: row.outcome_id,
  netQuantity: row.net_quantity,
  averageEntryPrice: row.average_entry_price,
  realizedPnl: row.realized_pnl,
  updatedAt: toIsoString(row.updated_at),
});

export const getPositionForUpdate = async (
  transaction: DatabaseTransaction,
  input: {
    userId: string;
    marketId: string;
    outcomeId: string;
  },
): Promise<PositionState | null> => {
  const [row] = await transaction.query<PositionRow>(
    `
      select
        id,
        user_id,
        market_id,
        outcome_id,
        net_quantity,
        average_entry_price,
        realized_pnl,
        updated_at
      from public.positions
      where user_id = $1::uuid
        and market_id = $2::uuid
        and outcome_id = $3::uuid
      limit 1
      for update
    `,
    [input.userId, input.marketId, input.outcomeId],
  );

  return row ? mapPositionRow(row) : null;
};

export const upsertPosition = async (
  transaction: DatabaseTransaction,
  position: PositionState,
): Promise<void> => {
  await transaction.query(
    `
      insert into public.positions (
        id,
        user_id,
        market_id,
        outcome_id,
        net_quantity,
        average_entry_price,
        realized_pnl,
        updated_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5,
        $6,
        $7,
        $8::timestamptz
      )
      on conflict (user_id, market_id, outcome_id)
      do update set
        net_quantity = excluded.net_quantity,
        average_entry_price = excluded.average_entry_price,
        realized_pnl = excluded.realized_pnl,
        updated_at = excluded.updated_at
    `,
    [
      position.id,
      position.userId,
      position.marketId,
      position.outcomeId,
      position.netQuantity,
      position.averageEntryPrice,
      position.realizedPnl,
      position.updatedAt,
    ],
  );
};

export const updateCancelledOrder = async (
  transaction: DatabaseTransaction,
  order: Order,
): Promise<void> => {
  await transaction.query(
    `
      update public.orders
      set status = $2,
          reserved_amount = $3,
          updated_at = $4::timestamptz
      where id = $1::uuid
    `,
    [order.id, order.status, order.reservedAmount, order.updatedAt],
  );
};

export const insertLedgerMutation = async (
  transaction: DatabaseTransaction,
  mutation: LedgerMutationResult,
): Promise<void> => {
  await transaction.query(
    `
      insert into public.ledger_journals (
        id,
        journal_kind,
        reference,
        metadata,
        created_at
      ) values (
        $1::uuid,
        $2,
        $3,
        $4::jsonb,
        $5::timestamptz
      )
    `,
    [
      mutation.journal.id,
      mutation.journal.kind,
      mutation.journal.reference,
      JSON.stringify(mutation.journal.metadata),
      mutation.journal.createdAt,
    ],
  );

  for (const entry of mutation.entries) {
    await transaction.query(
      `
        insert into public.ledger_entries (
          journal_id,
          account_code,
          direction,
          amount,
          currency,
          created_at
        ) values (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6::timestamptz
        )
      `,
      [
        entry.journalId,
        entry.accountCode,
        entry.direction,
        entry.amount,
        entry.currency,
        mutation.journal.createdAt,
      ],
    );
  }
};
