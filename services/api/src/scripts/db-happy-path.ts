import crypto from "node:crypto";

import type { DepositVerificationAdapter } from "@bet/chain";
import { createDatabaseClient } from "@bet/db";
import { Wallet } from "ethers";
import { createOrder, drainSubmittedOrderMatchingQueue } from "@bet/trading";

import { resolveMarket } from "../modules/admin/handlers";
import { claimMarket, getClaimableStateForMarket } from "../modules/claims/handlers";
import { verifyDepositWithDependencies } from "../modules/deposits/handlers";
import { DEMO_USER_ID, INTEGRATION_FLOW_USER_ID } from "../modules/shared/constants";
import { getLinkedWallet, linkBaseWallet } from "../modules/wallets/handlers";

const db = createDatabaseClient();

const MARKET_ID = "77777777-7777-4777-8777-777777777777";
const WINNING_OUTCOME_ID = "88888888-8888-4888-8888-888888888888";
const ORDER_PREFIX = "db-happy-path";
const PRICE_TICKS = 44n;
const RESTING_QUANTITY = 10n;
const CROSSING_QUANTITY = 6n;
const DEPOSIT_AMOUNT = 5000n;

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

interface ClaimSummaryRow {
  id: string;
  status: "pending" | "claimable" | "claimed" | "blocked";
  claimable_amount: bigint;
  claimed_amount: bigint;
}

interface WithdrawalSummaryRow {
  id: string;
  status: string;
  amount: bigint;
  currency: string;
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
    [userId, MARKET_ID, WINNING_OUTCOME_ID],
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

const getClaimSummary = async (userId: string, marketId: string) => {
  const [row] = await db.query<ClaimSummaryRow>(
    `
      select
        id,
        status,
        claimable_amount,
        claimed_amount
      from public.claims
      where user_id = $1::uuid
        and market_id = $2::uuid
      order by created_at desc, id desc
      limit 1
    `,
    [userId, marketId],
  );

  return row ?? null;
};

const listWithdrawalsIfTableExists = async (userId: string): Promise<WithdrawalSummaryRow[]> => {
  const [tableExists] = await db.query<{ exists: boolean }>(
    `
      select exists(
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'withdrawals'
      ) as exists
    `,
  );

  if (!tableExists?.exists) {
    return [];
  }

  return db.query<WithdrawalSummaryRow>(
    `
      select
        id,
        status,
        amount,
        currency
      from public.withdrawals
      where user_id = $1::uuid
      order by created_at desc
      limit 5
    `,
    [userId],
  );
};

const cleanupScenarioOrders = async (userId: string) => {
  const orders = await db.query<{ id: string }>(
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
    [userId, MARKET_ID, WINNING_OUTCOME_ID, `${ORDER_PREFIX}%`],
  );

  for (const order of orders) {
    await db.query(
      `
        update public.orders
        set status = 'cancelled', updated_at = now()
        where id = $1::uuid
      `,
      [order.id],
    );
  }
};

const buildStubDepositAdapter = (walletAddress: string, txHash: string): DepositVerificationAdapter => ({
  verifyUsdcTransfer: async () => ({
    status: "confirmed",
    confirmations: 99,
    transfer: {
      txHash,
      from: walletAddress,
      to: process.env.BASE_TREASURY_ADDRESS ?? "0x00000000000000000000000000000000000000aa",
      tokenAddress: (process.env.BASE_USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase(),
      amount: DEPOSIT_AMOUNT,
      blockNumber: 12345678n,
      success: true,
    },
  }),
});

const main = async () => {
  await cleanupScenarioOrders(DEMO_USER_ID);
  await cleanupScenarioOrders(INTEGRATION_FLOW_USER_ID);

  const runId = crypto.randomUUID().slice(0, 8);

  const demoFundsBeforeDeposit = await getFundsSnapshot(DEMO_USER_ID);

  const demoWallet = Wallet.createRandom();
  const walletAddress = demoWallet.address.toLowerCase();
  const signedMessage = `Bet wallet link\nuser:${DEMO_USER_ID}\nnonce:${runId}`;
  const signature = await demoWallet.signMessage(signedMessage);

  const linkedWallet = await linkBaseWallet({
    userId: DEMO_USER_ID,
    walletAddress,
    signedMessage,
    signature,
  });
  const fetchedWallet = await getLinkedWallet(DEMO_USER_ID);

  assertCondition(linkedWallet.walletAddress === walletAddress, "linked wallet should be persisted");
  assertCondition(fetchedWallet?.walletAddress === walletAddress, "linked wallet should be fetchable");

  process.env.BASE_TREASURY_ADDRESS ||= "0x00000000000000000000000000000000000000aa";
  const depositTxHash = `0x${runId.padEnd(64, "a")}`;
  const depositResult = await verifyDepositWithDependencies(
    { userId: DEMO_USER_ID, txHash: depositTxHash },
    { adapter: buildStubDepositAdapter(walletAddress, depositTxHash) },
  );

  assertCondition(depositResult.status === "accepted", "deposit verification should accept stubbed transfer");
  assertCondition(depositResult.deposit.amount === DEPOSIT_AMOUNT, "deposit amount should match stub amount");

  const demoFundsAfterDeposit = await getFundsSnapshot(DEMO_USER_ID);
  assertCondition(
    demoFundsAfterDeposit.available - demoFundsBeforeDeposit.available === DEPOSIT_AMOUNT,
    "verified deposit should credit demo available balance",
  );

  const buyerFundsBeforeTrade = demoFundsAfterDeposit;
  const sellerFundsBeforeTrade = await getFundsSnapshot(INTEGRATION_FLOW_USER_ID);
  const buyerPositionBeforeTrade = await getPositionSnapshot(DEMO_USER_ID);
  const sellerPositionBeforeTrade = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);

  const restingOrder = await createOrder({
    marketId: MARKET_ID,
    outcomeId: WINNING_OUTCOME_ID,
    side: "sell",
    orderType: "limit",
    price: PRICE_TICKS,
    quantity: RESTING_QUANTITY,
    clientOrderId: `${ORDER_PREFIX}-resting-${runId}`,
  });

  const crossingOrder = await createOrder({
    marketId: MARKET_ID,
    outcomeId: WINNING_OUTCOME_ID,
    side: "buy",
    orderType: "limit",
    price: PRICE_TICKS,
    quantity: CROSSING_QUANTITY,
    clientOrderId: `${ORDER_PREFIX}-crossing-${runId}`,
  });

  assertCondition(restingOrder.status === "pending", "resting order should be accepted before matching queue drains");
  assertCondition(crossingOrder.status === "pending", "crossing order should be accepted before matching queue drains");

  const processedJobs = await drainSubmittedOrderMatchingQueue();
  assertCondition(processedJobs >= 2, "worker should process both submitted matching jobs");

  const [trade] = await db.query<TradeRow>(
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

  const persistedRestingOrder = await getOrderState(restingOrder.order.id);
  const persistedCrossingOrder = await getOrderState(crossingOrder.order.id);

  assertCondition(trade, "trade row should be persisted");
  assertCondition(trade.market_id === MARKET_ID, "trade should belong to seeded market");
  assertCondition(trade.outcome_id === WINNING_OUTCOME_ID, "trade should belong to seeded outcome");
  assertCondition(trade.quantity === CROSSING_QUANTITY, "trade quantity should match crossing quantity");

  assertCondition(persistedRestingOrder?.status === "partially_filled", "resting order should be partially filled");
  assertCondition(
    persistedRestingOrder.remaining_quantity === RESTING_QUANTITY - CROSSING_QUANTITY,
    "resting order remaining quantity should shrink",
  );
  assertCondition(persistedCrossingOrder?.status === "filled", "crossing order should be filled");
  assertCondition(persistedCrossingOrder.remaining_quantity === 0n, "crossing order should have zero remaining quantity");

  const buyerPositionAfterTrade = await getPositionSnapshot(DEMO_USER_ID);
  const sellerPositionAfterTrade = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);

  assertCondition(
    buyerPositionAfterTrade.netQuantity - buyerPositionBeforeTrade.netQuantity === CROSSING_QUANTITY,
    "buyer position should increase by traded quantity",
  );
  assertCondition(
    sellerPositionAfterTrade.netQuantity - sellerPositionBeforeTrade.netQuantity === -CROSSING_QUANTITY,
    "seller position should decrease by traded quantity",
  );

  const buyerFundsAfterTrade = await getFundsSnapshot(DEMO_USER_ID);
  const sellerFundsAfterTrade = await getFundsSnapshot(INTEGRATION_FLOW_USER_ID);

  assertCondition(
    buyerFundsAfterTrade.available - buyerFundsBeforeTrade.available === -(PRICE_TICKS * CROSSING_QUANTITY),
    "buyer available balance should decrease by trade notional",
  );
  assertCondition(
    buyerFundsAfterTrade.reserved - buyerFundsBeforeTrade.reserved === 0n,
    "buyer reserved balance should net to zero",
  );
  assertCondition(
    sellerFundsAfterTrade.available - sellerFundsBeforeTrade.available === -(PRICE_TICKS * RESTING_QUANTITY),
    "seller available balance should reflect reserve hold",
  );

  const resolutionResult = await resolveMarket({
    marketId: MARKET_ID,
    winningOutcomeId: WINNING_OUTCOME_ID,
    evidenceText: `happy path settlement evidence (${runId})`,
    evidenceUrl: null,
    resolverId: "integration-script",
    isAdmin: true,
  });

  assertCondition(resolutionResult.status === "resolved", "admin resolution should mark market resolved");
  assertCondition(
    resolutionResult.resolution.winningOutcomeId === WINNING_OUTCOME_ID,
    "admin resolution should persist winning outcome",
  );

  const claimableBeforeClaim = await getClaimableStateForMarket({
    userId: DEMO_USER_ID,
    marketId: MARKET_ID,
  });
  assertCondition(claimableBeforeClaim.claimableAmount > 0n, "demo user should have positive claimable amount");

  const claimResult = await claimMarket({
    marketId: MARKET_ID,
    userId: DEMO_USER_ID,
  });

  assertCondition(Boolean(claimResult.payoutJournalId), "claim should produce a payout journal id");

  const claimSummary = await getClaimSummary(DEMO_USER_ID, MARKET_ID);
  assertCondition(claimSummary?.status === "claimed", "claim row should be persisted as claimed");

  const withdrawals = await listWithdrawalsIfTableExists(DEMO_USER_ID);

  const finalBuyerFunds = await getFundsSnapshot(DEMO_USER_ID);
  const finalSellerFunds = await getFundsSnapshot(INTEGRATION_FLOW_USER_ID);
  const finalBuyerPosition = await getPositionSnapshot(DEMO_USER_ID);
  const finalSellerPosition = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);

  console.log("db-happy-path: ok");
  console.log(
    JSON.stringify(
      {
        runId,
        marketId: MARKET_ID,
        winningOutcomeId: WINNING_OUTCOME_ID,
        deposit: {
          txHash: depositResult.deposit.txHash,
          amount: depositResult.deposit.amount.toString(),
          status: depositResult.status,
        },
        trading: {
          processedJobs,
          tradeId: trade.id,
          makerOrderId: restingOrder.order.id,
          takerOrderId: crossingOrder.order.id,
        },
        finalBalances: {
          demoUser: {
            available: finalBuyerFunds.available.toString(),
            reserved: finalBuyerFunds.reserved.toString(),
          },
          integrationUser: {
            available: finalSellerFunds.available.toString(),
            reserved: finalSellerFunds.reserved.toString(),
          },
        },
        finalPositions: {
          demoUser: {
            netQuantity: finalBuyerPosition.netQuantity.toString(),
            averageEntryPrice: finalBuyerPosition.averageEntryPrice.toString(),
          },
          integrationUser: {
            netQuantity: finalSellerPosition.netQuantity.toString(),
            averageEntryPrice: finalSellerPosition.averageEntryPrice.toString(),
          },
        },
        claim: claimSummary
          ? {
              id: claimSummary.id,
              status: claimSummary.status,
              claimableAmount: claimSummary.claimable_amount.toString(),
              claimedAmount: claimSummary.claimed_amount.toString(),
            }
          : null,
        withdrawals,
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
