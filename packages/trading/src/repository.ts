import type {
  Order,
  OrderBookLevel,
  OrderSubmittedForMatchingCommand,
  PortfolioBalance,
  Position,
} from "@bet/contracts";
import type { DatabaseClient, DatabaseExecutor, DatabaseTransaction } from "@bet/db";
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
  matching_processed_at: Date | string | null;
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

interface MatchingCommandRow {
  id: string;
  command_type: "order_submitted_for_matching";
  order_id: string;
  market_id: string;
  payload: OrderSubmittedForMatchingCommand;
  created_at: Date | string;
  claimed_at: Date | string | null;
  claim_token: string | null;
  claim_expires_at: Date | string | null;
  processed_at: Date | string | null;
  attempt_count: number;
  last_error: string | null;
}

interface BalanceSnapshotRow {
  currency: string;
  available: bigint;
  reserved: bigint;
}

interface OutcomeOrderBookLevelRow {
  side: OrderBookLevel["side"];
  price_ticks: bigint;
  quantity_atoms: bigint;
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIsoString = (value: Date | string | null): string | null =>
  value ? toIsoString(value) : null;

export interface StoredOrder extends Order {
  matchingProcessedAt: string | null;
}

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

export const allocatePublicMarketSequences = async (
  transaction: DatabaseTransaction,
  marketId: string,
  count: number,
): Promise<bigint[]> => {
  if (count <= 0) {
    return [];
  }

  const [row] = await transaction.query<{ sequence: bigint }>(
    `
      insert into public.market_realtime_sequences (
        market_id,
        sequence,
        updated_at
      ) values (
        $1::uuid,
        $2::bigint,
        now()
      )
      on conflict (market_id)
      do update set
        sequence = public.market_realtime_sequences.sequence + excluded.sequence,
        updated_at = now()
      returning sequence
    `,
    [marketId, BigInt(count)],
  );

  const endingSequence = row?.sequence ?? BigInt(count);
  const startingSequence = endingSequence - BigInt(count) + 1n;

  return Array.from({ length: count }, (_value, index) => startingSequence + BigInt(index));
};

export type PositionState = Position;

export interface ClaimedOrderMatchingCommand {
  id: string;
  command: OrderSubmittedForMatchingCommand;
  orderId: string;
  marketId: string;
  claimToken: string;
  createdAt: string;
  attemptCount: number;
}

const mapOrderRow = (row: OrderRow): StoredOrder => ({
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
  matchingProcessedAt: toNullableIsoString(row.matching_processed_at),
});

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

const mapMatchingCommandRow = (row: MatchingCommandRow): ClaimedOrderMatchingCommand => ({
  id: row.id,
  command: row.payload,
  orderId: row.order_id,
  marketId: row.market_id,
  claimToken: row.claim_token ?? "",
  createdAt: toIsoString(row.created_at),
  attemptCount: row.attempt_count,
});

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
): Promise<StoredOrder | null> => {
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
        updated_at,
        matching_processed_at
      from public.orders
      where id = $1::uuid
      limit 1
      for update
    `,
    [orderId],
  );

  return row ? mapOrderRow(row) : null;
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
): Promise<StoredOrder[]> => {
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
        updated_at,
        matching_processed_at
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

export const markOrderMatchingProcessed = async (
  transaction: DatabaseTransaction,
  input: { orderId: string; processedAt: string },
): Promise<void> => {
  await transaction.query(
    `
      update public.orders
      set matching_processed_at = $2::timestamptz,
          updated_at = greatest(updated_at, $2::timestamptz)
      where id = $1::uuid
    `,
    [input.orderId, input.processedAt],
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
          id,
          journal_id,
          account_code,
          direction,
          amount,
          currency,
          created_at
        ) values (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          $5,
          $6,
          $7::timestamptz
        )
      `,
      [
        entry.id,
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

export const enqueueSubmittedOrderMatchingCommand = async (
  executor: DatabaseExecutor,
  command: OrderSubmittedForMatchingCommand,
): Promise<void> => {
  await executor.query(
    `
      insert into public.matching_commands (
        command_type,
        order_id,
        market_id,
        payload,
        created_at
      ) values (
        'order_submitted_for_matching',
        $1::uuid,
        $2::uuid,
        $3::jsonb,
        $4::timestamptz
      )
      on conflict (command_type, order_id)
      do nothing
    `,
    [command.orderId, command.marketId, JSON.stringify(command), command.enqueuedAt],
  );
};

export const claimNextSubmittedOrderMatchingCommand = async (
  db: DatabaseClient,
  claimTtlMs: number,
): Promise<ClaimedOrderMatchingCommand | null> => {
  const claimToken = crypto.randomUUID();
  const claimedAt = new Date().toISOString();
  const claimExpiresAt = new Date(Date.now() + claimTtlMs).toISOString();

  return db.transaction(async (transaction) => {
    const [candidate] = await transaction.query<MatchingCommandRow>(
      `
        select
          id,
          command_type,
          order_id,
          market_id,
          payload,
          created_at,
          claimed_at,
          claim_token,
          claim_expires_at,
          processed_at,
          attempt_count,
          last_error
        from public.matching_commands
        where command_type = 'order_submitted_for_matching'
          and processed_at is null
          and (claim_expires_at is null or claim_expires_at <= now())
        order by created_at asc, id asc
        limit 1
        for update skip locked
      `,
    );

    if (!candidate) {
      return null;
    }

    const [claimed] = await transaction.query<MatchingCommandRow>(
      `
        update public.matching_commands
        set claimed_at = $2::timestamptz,
            claim_token = $3::uuid,
            claim_expires_at = $4::timestamptz,
            attempt_count = attempt_count + 1,
            last_error = null
        where id = $1::uuid
        returning
          id,
          command_type,
          order_id,
          market_id,
          payload,
          created_at,
          claimed_at,
          claim_token,
          claim_expires_at,
          processed_at,
          attempt_count,
          last_error
      `,
      [candidate.id, claimedAt, claimToken, claimExpiresAt],
    );

    return claimed ? mapMatchingCommandRow(claimed) : null;
  });
};

export const markSubmittedOrderMatchingCommandProcessed = async (
  db: DatabaseClient,
  input: {
    commandId: string;
    claimToken: string;
    processedAt: string;
  },
): Promise<void> => {
  await db.query(
    `
      update public.matching_commands
      set processed_at = $3::timestamptz,
          claim_expires_at = null,
          last_error = null
      where id = $1::uuid
        and claim_token = $2::uuid
    `,
    [input.commandId, input.claimToken, input.processedAt],
  );
};

export const markSubmittedOrderMatchingCommandFailed = async (
  db: DatabaseClient,
  input: {
    commandId: string;
    claimToken: string;
    errorMessage: string;
  },
): Promise<void> => {
  await db.query(
    `
      update public.matching_commands
      set claimed_at = null,
          claim_token = null,
          claim_expires_at = null,
          last_error = $3
      where id = $1::uuid
        and claim_token = $2::uuid
    `,
    [input.commandId, input.claimToken, input.errorMessage.slice(0, 1000)],
  );
};

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildReservedFundsAccountCode = (userId: string): string => `user:${userId}:funds:reserved`;

export const getBalanceSnapshot = async (
  executor: DatabaseExecutor,
  input: { userId: string; currency: string },
): Promise<PortfolioBalance> => {
  const [row] = await executor.query<BalanceSnapshotRow>(
    `
      select
        currency,
        coalesce(
          sum(
            case
              when account_code = $1 and direction = 'debit' then amount
              when account_code = $1 and direction = 'credit' then -amount
              else 0
            end
          )::bigint,
          0::bigint
        ) as available,
        coalesce(
          sum(
            case
              when account_code = $2 and direction = 'debit' then amount
              when account_code = $2 and direction = 'credit' then -amount
              else 0
            end
          )::bigint,
          0::bigint
        ) as reserved
      from public.ledger_entries
      where account_code in ($1, $2)
      group by currency
      order by currency asc
      limit 1
    `,
    [buildAvailableFundsAccountCode(input.userId), buildReservedFundsAccountCode(input.userId)],
  );

  return {
    currency: row?.currency ?? input.currency,
    available: row?.available ?? 0n,
    reserved: row?.reserved ?? 0n,
  };
};

export const getOutcomeOrderBookSnapshot = async (
  executor: DatabaseExecutor,
  input: { marketId: string; outcomeId: string },
): Promise<{ bids: Array<[bigint, bigint]>; asks: Array<[bigint, bigint]> }> => {
  const rows = await executor.query<OutcomeOrderBookLevelRow>(
    `
      select
        side,
        price as price_ticks,
        sum(remaining_quantity)::bigint as quantity_atoms
      from public.orders
      where market_id = $1::uuid
        and outcome_id = $2::uuid
        and status in ('open', 'partially_filled')
        and remaining_quantity > 0
      group by side, price
      order by
        case when side = 'buy' then 0 else 1 end asc,
        case when side = 'buy' then price end desc,
        case when side = 'sell' then price end asc
    `,
    [input.marketId, input.outcomeId],
  );

  const bids: Array<[bigint, bigint]> = [];
  const asks: Array<[bigint, bigint]> = [];

  for (const row of rows) {
    const level: [bigint, bigint] = [row.price_ticks, row.quantity_atoms];
    if (row.side === "buy") {
      bids.push(level);
      continue;
    }

    asks.push(level);
  }

  return { bids, asks };
};
