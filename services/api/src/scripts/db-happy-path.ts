import { createDatabaseClient } from "@bet/db";
import { drainSubmittedOrderMatchingQueue } from "@bet/trading";

import { cancelOrder, createOrder } from "../modules/orders/handlers";
import { DEMO_USER_ID, INTEGRATION_FLOW_USER_ID } from "../modules/shared/constants";

const db = createDatabaseClient();

const MARKET_ID = "77777777-7777-4777-8777-777777777777";
const OUTCOME_ID = "88888888-8888-4888-8888-888888888888";
const ORDER_PREFIX = "db-happy-path";
const PRICE_TICKS = 44n;
const RESTING_QUANTITY = 10n;
const CROSSING_QUANTITY = 6n;

interface FundsSnapshotRow {
  available: bigint;
  reserved: bigint;
}

interface PositionSnapshotRow {
  net_quantity: bigint;
  average_entry_price: bigint;
}

interface OrderStateRow {
  id: string;
  status: "open" | "partially_filled" | "filled" | "cancelled" | "pending" | "rejected";
  remaining_quantity: bigint;
  reserved_amount: bigint;
}

interface TradeRow {
  id: string;
  market_id: string;
  outcome_id: string;
  maker_order_id: string;
  taker_order_id: string;
  price: bigint;
  quantity: bigint;
}

interface ExistsRow {
  exists: boolean;
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildReservedFundsAccountCode = (userId: string): string => `user:${userId}:funds:reserved`;

const getFundsSnapshot = async (userId: string) => {
  const [row] = await db.query<FundsSnapshotRow>(
    `
      select
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
    `,
    [buildAvailableFundsAccountCode(userId), buildReservedFundsAccountCode(userId)],
  );

  return {
    available: row?.available ?? 0n,
    reserved: row?.reserved ?? 0n,
  };
};

const getPositionSnapshot = async (userId: string) => {
  const [row] = await db.query<PositionSnapshotRow>(
    `
      select
        net_quantity,
        average_entry_price
      from public.positions
      where user_id = $1::uuid
        and market_id = $2::uuid
        and outcome_id = $3::uuid
      limit 1
    `,
    [userId, MARKET_ID, OUTCOME_ID],
  );

  return {
    netQuantity: row?.net_quantity ?? 0n,
    averageEntryPrice: row?.average_entry_price ?? 0n,
  };
};

const getOrderState = async (orderId: string) => {
  const [row] = await db.query<OrderStateRow>(
    `
      select
        id,
        status,
        remaining_quantity,
        reserved_amount
      from public.orders
      where id = $1::uuid
      limit 1
    `,
    [orderId],
  );

  return row ?? null;
};

const getTrade = async (tradeId: string) => {
  const [row] = await db.query<TradeRow>(
    `
      select
        id,
        market_id,
        outcome_id,
        maker_order_id,
        taker_order_id,
        price,
        quantity
      from public.trades
      where id = $1::uuid
      limit 1
    `,
    [tradeId],
  );

  return row ?? null;
};

const cleanupScenarioOrders = async (userId: string) => {
  const orders = await db.query<{
    id: string;
  }>(
    `
      select id
      from public.orders
      where user_id = $1::uuid
        and market_id = $2::uuid
        and outcome_id = $3::uuid
        and client_order_id like $4
        and status in ('pending', 'open', 'partially_filled')
      order by created_at desc, id desc
    `,
    [userId, MARKET_ID, OUTCOME_ID, `${ORDER_PREFIX}%`],
  );

  for (const order of orders) {
    try {
      await cancelOrder({ orderId: order.id });
    } catch (error) {
      console.warn("cleanupScenarioOrders: skipping order", {
        orderId: order.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

const ensureIntegrationUserSeeded = async () => {
  const [profileExistsRow] = await db.query<ExistsRow>(
    `
      select exists(
        select 1
        from public.profiles
        where id = $1::uuid
      ) as exists
    `,
    [INTEGRATION_FLOW_USER_ID],
  );

  if (!profileExistsRow?.exists) {
    await db.query(
      `
        insert into auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at,
          confirmation_token,
          email_change,
          email_change_token_new,
          recovery_token
        ) values (
          '00000000-0000-0000-0000-000000000000',
          $1::uuid,
          'authenticated',
          'authenticated',
          'integration@bet.local',
          crypt('integration-password', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}',
          '{"display_name":"Integration Trader"}',
          now(),
          now(),
          '',
          '',
          '',
          ''
        )
        on conflict (id) do nothing
      `,
      [INTEGRATION_FLOW_USER_ID],
    );

    await db.query(
      `
        insert into public.profiles (
          id,
          username,
          display_name,
          wallet_address
        ) values (
          $1::uuid,
          'integration-trader',
          'Integration Trader',
          null
        )
        on conflict (id) do update
        set username = excluded.username,
            display_name = excluded.display_name,
            wallet_address = excluded.wallet_address,
            updated_at = now()
      `,
      [INTEGRATION_FLOW_USER_ID],
    );
  }

  const [journalExistsRow] = await db.query<ExistsRow>(
    `
      select exists(
        select 1
        from public.ledger_journals
        where journal_kind = 'deposit'
          and reference = 'seed:integration-user:initial-funds'
      ) as exists
    `,
  );

  if (!journalExistsRow?.exists) {
    await db.transaction(async (transaction) => {
      await transaction.query(
        `
          insert into public.ledger_journals (
            id,
            journal_kind,
            reference,
            metadata,
            created_at
          ) values (
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'deposit',
            'seed:integration-user:initial-funds',
            $1::jsonb,
            '2026-04-20T00:00:00.000Z'::timestamptz
          )
        `,
        [JSON.stringify({ seed: "true", userId: INTEGRATION_FLOW_USER_ID })],
      );

      await transaction.query(
        `
          insert into public.ledger_entries (
            journal_id,
            account_code,
            direction,
            amount,
            currency,
            created_at
          ) values
            (
              'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              $1,
              'debit',
              100000,
              'USD',
              '2026-04-20T00:00:00.000Z'::timestamptz
            ),
            (
              'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              'platform:seed:cash',
              'credit',
              100000,
              'USD',
              '2026-04-20T00:00:00.000Z'::timestamptz
            )
        `,
        [buildAvailableFundsAccountCode(INTEGRATION_FLOW_USER_ID)],
      );
    });
  }
};

const main = async () => {
  await ensureIntegrationUserSeeded();
  await cleanupScenarioOrders(DEMO_USER_ID);
  await cleanupScenarioOrders(INTEGRATION_FLOW_USER_ID);

  const buyerFundsBefore = await getFundsSnapshot(DEMO_USER_ID);
  const sellerFundsBefore = await getFundsSnapshot(INTEGRATION_FLOW_USER_ID);
  const buyerPositionBefore = await getPositionSnapshot(DEMO_USER_ID);
  const sellerPositionBefore = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);

  const runId = crypto.randomUUID().slice(0, 8);

  const restingOrder = await createOrder({
    marketId: MARKET_ID,
    outcomeId: OUTCOME_ID,
    side: "sell",
    orderType: "limit",
    price: PRICE_TICKS,
    quantity: RESTING_QUANTITY,
    clientOrderId: `${ORDER_PREFIX}-resting-${runId}`,
  });

  assertCondition(restingOrder.status === "pending", "resting order should be accepted before worker matching");
  assertCondition(restingOrder.trades.length === 0, "resting order should not trade immediately");

  const crossingOrder = await createOrder({
    marketId: MARKET_ID,
    outcomeId: OUTCOME_ID,
    side: "buy",
    orderType: "limit",
    price: PRICE_TICKS,
    quantity: CROSSING_QUANTITY,
    clientOrderId: `${ORDER_PREFIX}-crossing-${runId}`,
  });

  assertCondition(crossingOrder.status === "pending", "crossing order should be accepted before worker matching");
  assertCondition(crossingOrder.trades.length === 0, "crossing order should not trade inline anymore");

  const processedJobs = await drainSubmittedOrderMatchingQueue();
  assertCondition(processedJobs >= 2, "worker should process both submitted matching jobs");

  const [persistedTradeRow] = await db.query<TradeRow>(
    `
      select
        id,
        market_id,
        outcome_id,
        maker_order_id,
        taker_order_id,
        price,
        quantity
      from public.trades
      where maker_order_id = $1::uuid
        and taker_order_id = $2::uuid
      order by matched_at desc
      limit 1
    `,
    [restingOrder.order.id, crossingOrder.order.id],
  );
  const persistedTrade = persistedTradeRow ?? null;
  const persistedRestingOrder = await getOrderState(restingOrder.order.id);
  const persistedCrossingOrder = await getOrderState(crossingOrder.order.id);

  assertCondition(persistedTrade, "trade row should be persisted");
  assertCondition(persistedTrade.market_id === MARKET_ID, "trade should belong to the seed market");
  assertCondition(persistedTrade.outcome_id === OUTCOME_ID, "trade should belong to the seeded outcome");
  assertCondition(persistedTrade.maker_order_id === restingOrder.order.id, "resting order should be maker");
  assertCondition(persistedTrade.taker_order_id === crossingOrder.order.id, "crossing order should be taker");
  assertCondition(persistedTrade.price === PRICE_TICKS, "trade should persist the matched price");
  assertCondition(
    persistedTrade.quantity === CROSSING_QUANTITY,
    "trade should persist the matched quantity",
  );

  assertCondition(persistedRestingOrder, "resting order row should exist");
  assertCondition(
    persistedRestingOrder.status === "partially_filled",
    "resting order should be partially filled",
  );
  assertCondition(
    persistedRestingOrder.remaining_quantity === RESTING_QUANTITY - CROSSING_QUANTITY,
    "resting order should keep its remaining quantity",
  );
  assertCondition(
    persistedRestingOrder.reserved_amount === PRICE_TICKS * (RESTING_QUANTITY - CROSSING_QUANTITY),
    "resting order reserve should shrink to the remaining quantity",
  );

  assertCondition(persistedCrossingOrder, "crossing order row should exist");
  assertCondition(persistedCrossingOrder.status === "filled", "crossing order should be filled");
  assertCondition(
    persistedCrossingOrder.remaining_quantity === 0n,
    "crossing order should have no remaining quantity",
  );
  assertCondition(
    persistedCrossingOrder.reserved_amount === 0n,
    "crossing order should fully release consumed reserve",
  );

  const buyerPositionAfter = await getPositionSnapshot(DEMO_USER_ID);
  const sellerPositionAfter = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);

  assertCondition(
    buyerPositionAfter.netQuantity - buyerPositionBefore.netQuantity === CROSSING_QUANTITY,
    "buyer position should increase by the traded quantity",
  );
  assertCondition(
    sellerPositionAfter.netQuantity - sellerPositionBefore.netQuantity === -CROSSING_QUANTITY,
    "seller position should decrease by the traded quantity",
  );

  const buyerFundsAfter = await getFundsSnapshot(DEMO_USER_ID);
  const sellerFundsAfter = await getFundsSnapshot(INTEGRATION_FLOW_USER_ID);

  assertCondition(
    buyerFundsAfter.available - buyerFundsBefore.available === -(PRICE_TICKS * CROSSING_QUANTITY),
    "buyer available balance should decrease by the traded notional",
  );
  assertCondition(
    buyerFundsAfter.reserved - buyerFundsBefore.reserved === 0n,
    "buyer reserved balance should net back to zero after the fill",
  );
  assertCondition(
    sellerFundsAfter.available - sellerFundsBefore.available === -(PRICE_TICKS * RESTING_QUANTITY),
    "seller available balance should reflect the initial reserve hold",
  );
  assertCondition(
    sellerFundsAfter.reserved - sellerFundsBefore.reserved ===
      PRICE_TICKS * (RESTING_QUANTITY - CROSSING_QUANTITY),
    "seller reserved balance should equal the remaining resting quantity",
  );

  console.log("db-happy-path: ok");
  console.log(
    JSON.stringify(
      {
        processedJobs,
        tradeId: persistedTrade.id,
        makerOrderId: restingOrder.order.id,
        takerOrderId: crossingOrder.order.id,
        buyerNetQuantityDelta: (
          buyerPositionAfter.netQuantity - buyerPositionBefore.netQuantity
        ).toString(),
        sellerNetQuantityDelta: (
          sellerPositionAfter.netQuantity - sellerPositionBefore.netQuantity
        ).toString(),
        buyerAvailableDelta: (buyerFundsAfter.available - buyerFundsBefore.available).toString(),
        sellerReservedDelta: (sellerFundsAfter.reserved - sellerFundsBefore.reserved).toString(),
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error("db-happy-path: failed");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
