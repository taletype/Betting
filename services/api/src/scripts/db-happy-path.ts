import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DepositVerificationAdapter } from "@bet/chain";
import { BASE_SEPOLIA_CHAIN_ID, readBaseChainId, readBaseExplorerUrl, readEthereumAddress } from "@bet/config";
import { createDatabaseClient } from "@bet/db";
import { Wallet } from "ethers";
import { createOrder, drainSubmittedOrderMatchingQueue } from "@bet/trading";

import { resolveMarket } from "../modules/admin/handlers";
import { claimMarket, getClaimableStateForMarket } from "../modules/claims/handlers";
import { verifyDepositWithDependencies } from "../modules/deposits/handlers";
import { DEMO_USER_ID, INTEGRATION_FLOW_USER_ID } from "../modules/shared/constants";
import { executeWithdrawal, failWithdrawal, requestWithdrawal } from "../modules/withdrawals/handlers";
import { getLinkedWallet, linkBaseWallet } from "../modules/wallets/handlers";

const db = createDatabaseClient();

const MARKET_ID = process.env.DB_HAPPY_PATH_MARKET_ID ?? "77777777-7777-4777-8777-777777777777";
const WINNING_OUTCOME_ID = process.env.DB_HAPPY_PATH_WINNING_OUTCOME_ID ?? "88888888-8888-4888-8888-888888888888";
const ORDER_PREFIX = "db-happy-path";
const PRICE_TICKS = 44n;
const RESTING_QUANTITY = 10n;
const CROSSING_QUANTITY = 6n;
const DEPOSIT_AMOUNT = 5000n;
const WITHDRAWAL_TEST_AMOUNT = 50n;

class InvariantError extends Error {
  constructor(
    message: string,
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InvariantError";
  }
}

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

interface OpenOrderSummaryRow {
  id: string;
  user_id: string;
  side: "buy" | "sell";
  status: "open" | "partially_filled";
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

interface TradeSummaryRow {
  id: string;
  maker_user_id: string;
  taker_user_id: string;
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
  tx_hash: string | null;
}

function assertCondition(
  condition: unknown,
  message: string,
  context?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new InvariantError(message, context);
  }
}

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildReservedFundsAccountCode = (userId: string): string => `user:${userId}:funds:reserved`;
const toTxExplorerUrl = (explorerBaseUrl: string, txHash: string): string =>
  `${explorerBaseUrl.replace(/\/$/, "")}/tx/${txHash}`;

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

const isWithdrawalsTableAvailable = async (): Promise<boolean> => {
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

  return Boolean(tableExists?.exists);
};

const listWithdrawalsIfTableExists = async (userId: string): Promise<WithdrawalSummaryRow[]> => {
  if (!(await isWithdrawalsTableAvailable())) {
    return [];
  }

  return db.query<WithdrawalSummaryRow>(
    `
      select
        id,
        status,
        amount,
        currency,
        tx_hash
      from public.withdrawals
      where user_id = $1::uuid
      order by created_at desc
      limit 5
    `,
    [userId],
  );
};

const listOpenOrders = async () =>
  db.query<OpenOrderSummaryRow>(
    `
      select
        id,
        user_id,
        side,
        status,
        remaining_quantity,
        reserved_amount
      from public.orders
      where market_id = $1::uuid
        and outcome_id = $2::uuid
        and status in ('open', 'partially_filled')
      order by created_at asc, id asc
    `,
    [MARKET_ID, WINNING_OUTCOME_ID],
  );

const listRecentTrades = async () =>
  db.query<TradeSummaryRow>(
    `
      select
        id,
        maker_user_id,
        taker_user_id,
        price,
        quantity
      from public.trades
      where market_id = $1::uuid
        and outcome_id = $2::uuid
      order by matched_at desc, id desc
      limit 10
    `,
    [MARKET_ID, WINNING_OUTCOME_ID],
  );

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

const buildStubDepositAdapter = (input: {
  walletAddress: string;
  txHash: string;
  treasuryAddress: string;
  tokenAddress: string;
}): DepositVerificationAdapter => ({
  verifyUsdcTransfer: async (verificationInput) => {
    assertCondition(
      verificationInput.txHash === input.txHash,
      "deposit verification should use the expected tx hash",
    );
    assertCondition(
      verificationInput.expectedFrom.toLowerCase() === input.walletAddress,
      "deposit verification should bind sender to linked wallet",
    );
    assertCondition(
      verificationInput.expectedTo.toLowerCase() === input.treasuryAddress,
      "deposit verification should target configured treasury address",
    );
    assertCondition(
      verificationInput.tokenAddress.toLowerCase() === input.tokenAddress,
      "deposit verification should target configured Base token address",
    );

    return {
      status: "confirmed",
      confirmations: 99,
      transfer: {
        txHash: input.txHash,
        from: input.walletAddress,
        to: input.treasuryAddress,
        tokenAddress: input.tokenAddress,
        amount: DEPOSIT_AMOUNT,
        blockNumber: 12345678n,
        success: true,
      },
    };
  },
});

const main = async () => {
  const chainId = readBaseChainId();
  assertCondition(chainId === BASE_SEPOLIA_CHAIN_ID, "db happy-path must run against Base Sepolia", {
    chainId,
    expectedChainId: BASE_SEPOLIA_CHAIN_ID,
  });
  const explorerUrl = readBaseExplorerUrl();
  const treasuryAddress = readEthereumAddress("BASE_TREASURY_ADDRESS");
  const tokenAddress = readEthereumAddress("BASE_USDC_ADDRESS");

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

  const depositTxHash = `0x${runId.padEnd(64, "a")}`;
  const depositResult = await verifyDepositWithDependencies(
    { userId: DEMO_USER_ID, txHash: depositTxHash },
    {
      adapter: buildStubDepositAdapter({
        walletAddress,
        txHash: depositTxHash,
        treasuryAddress,
        tokenAddress,
      }),
    },
  );

  assertCondition(depositResult.status === "accepted", "deposit verification should accept stubbed transfer");
  assertCondition(depositResult.deposit.amount === DEPOSIT_AMOUNT, "deposit amount should match stub amount");

  const demoFundsAfterDeposit = await getFundsSnapshot(DEMO_USER_ID);
  assertCondition(
    demoFundsAfterDeposit.available - demoFundsBeforeDeposit.available === DEPOSIT_AMOUNT,
    "verified deposit should credit demo available balance",
    {
      beforeAvailable: demoFundsBeforeDeposit.available.toString(),
      afterAvailable: demoFundsAfterDeposit.available.toString(),
      expectedDelta: DEPOSIT_AMOUNT.toString(),
    },
  );

  const buyerFundsBeforeTrade = demoFundsAfterDeposit;
  const sellerFundsBeforeTrade = await getFundsSnapshot(INTEGRATION_FLOW_USER_ID);
  const buyerPositionBeforeTrade = await getPositionSnapshot(DEMO_USER_ID);
  const sellerPositionBeforeTrade = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);

  const restingOrder = await createOrder({
    userId: INTEGRATION_FLOW_USER_ID,
    marketId: MARKET_ID,
    outcomeId: WINNING_OUTCOME_ID,
    side: "sell",
    orderType: "limit",
    price: PRICE_TICKS,
    quantity: RESTING_QUANTITY,
    clientOrderId: `${ORDER_PREFIX}-resting-${runId}`,
  });

  const crossingOrder = await createOrder({
    userId: DEMO_USER_ID,
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

  assertCondition(trade, "trade row should be persisted", {
    makerOrderId: restingOrder.order.id,
    takerOrderId: crossingOrder.order.id,
  });
  assertCondition(trade.market_id === MARKET_ID, "trade should belong to seeded market");
  assertCondition(trade.outcome_id === WINNING_OUTCOME_ID, "trade should belong to seeded outcome");
  assertCondition(trade.quantity === CROSSING_QUANTITY, "trade quantity should match crossing quantity");

  assertCondition(persistedRestingOrder?.status === "partially_filled", "resting order should be partially filled");
  assertCondition(
    persistedRestingOrder.remaining_quantity === RESTING_QUANTITY - CROSSING_QUANTITY,
    "resting order remaining quantity should shrink",
    {
      remainingQuantity: persistedRestingOrder.remaining_quantity.toString(),
      expectedRemainingQuantity: (RESTING_QUANTITY - CROSSING_QUANTITY).toString(),
    },
  );
  assertCondition(persistedCrossingOrder?.status === "filled", "crossing order should be filled");
  assertCondition(persistedCrossingOrder.remaining_quantity === 0n, "crossing order should have zero remaining quantity");

  const buyerPositionAfterTrade = await getPositionSnapshot(DEMO_USER_ID);
  const sellerPositionAfterTrade = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);

  assertCondition(
    buyerPositionAfterTrade.netQuantity - buyerPositionBeforeTrade.netQuantity === CROSSING_QUANTITY,
    "buyer position should increase by traded quantity",
    {
      beforeNetQuantity: buyerPositionBeforeTrade.netQuantity.toString(),
      afterNetQuantity: buyerPositionAfterTrade.netQuantity.toString(),
      expectedDelta: CROSSING_QUANTITY.toString(),
    },
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
  assertCondition(claimableBeforeClaim.claimableAmount > 0n, "demo user should have positive claimable amount", {
    claimableAmount: claimableBeforeClaim.claimableAmount.toString(),
    marketId: MARKET_ID,
    userId: DEMO_USER_ID,
  });

  const claimResult = await claimMarket({
    marketId: MARKET_ID,
    userId: DEMO_USER_ID,
  });

  assertCondition(Boolean(claimResult.payoutJournalId), "claim should produce a payout journal id");

  const claimSummary = await getClaimSummary(DEMO_USER_ID, MARKET_ID);
  assertCondition(claimSummary?.status === "claimed", "claim row should be persisted as claimed");

  const resolutionSummary = {
    status: resolutionResult.status,
    marketId: resolutionResult.resolution.marketId,
    winningOutcomeId: resolutionResult.resolution.winningOutcomeId,
    resolvedAt: resolutionResult.resolution.resolvedAt,
    notes: resolutionResult.resolution.notes,
  };

  let withdrawalSummary:
    | {
        executed: { id: string; status: string; txHash: string; explorerUrl: string };
        failed: { id: string; status: string };
      }
    | null = null;
  if (await isWithdrawalsTableAvailable()) {
    const beforeWithdrawalFunds = await getFundsSnapshot(DEMO_USER_ID);

    const executableWithdrawal = await requestWithdrawal({
      userId: DEMO_USER_ID,
      amountAtoms: WITHDRAWAL_TEST_AMOUNT,
      destinationAddress: "0x00000000000000000000000000000000000000bb",
    });
    const executeTxHash = `0x${runId.padEnd(64, "e")}`;
    const completedWithdrawal = await executeWithdrawal({
      adminUserId: INTEGRATION_FLOW_USER_ID,
      isAdmin: true,
      withdrawalId: executableWithdrawal.id,
      txHash: executeTxHash,
    });
    assertCondition(completedWithdrawal.status === "completed", "admin execute should mark withdrawal completed");
    assertCondition(completedWithdrawal.txHash === executeTxHash, "completed withdrawal should persist tx hash");

    const secondRequest = await requestWithdrawal({
      userId: DEMO_USER_ID,
      amountAtoms: WITHDRAWAL_TEST_AMOUNT,
      destinationAddress: "0x00000000000000000000000000000000000000bb",
    });
    const afterRequestFunds = await getFundsSnapshot(DEMO_USER_ID);
    assertCondition(
      beforeWithdrawalFunds.available - afterRequestFunds.available === WITHDRAWAL_TEST_AMOUNT * 2n,
      "two requested withdrawals should move available funds into pending withdrawal",
    );

    const failedWithdrawal = await failWithdrawal({
      adminUserId: INTEGRATION_FLOW_USER_ID,
      isAdmin: true,
      withdrawalId: secondRequest.id,
      reason: `db-happy-path rollback ${runId}`,
    });

    const afterFailureFunds = await getFundsSnapshot(DEMO_USER_ID);
    assertCondition(
      afterFailureFunds.available - beforeWithdrawalFunds.available === -WITHDRAWAL_TEST_AMOUNT,
      "executed withdrawal should keep one net debit after failed rollback request restores",
    );

    withdrawalSummary = {
      executed: {
        id: completedWithdrawal.id,
        status: completedWithdrawal.status,
        txHash: executeTxHash,
        explorerUrl: toTxExplorerUrl(explorerUrl, executeTxHash),
      },
      failed: {
        id: failedWithdrawal.id,
        status: failedWithdrawal.status,
      },
    };
  }

  const withdrawals = await listWithdrawalsIfTableExists(DEMO_USER_ID);

  const finalBuyerFunds = await getFundsSnapshot(DEMO_USER_ID);
  const finalSellerFunds = await getFundsSnapshot(INTEGRATION_FLOW_USER_ID);
  const finalBuyerPosition = await getPositionSnapshot(DEMO_USER_ID);
  const finalSellerPosition = await getPositionSnapshot(INTEGRATION_FLOW_USER_ID);
  const openOrders = await listOpenOrders();
  const recentTrades = await listRecentTrades();

  const artifact = {
    runId,
    config: {
      marketId: MARKET_ID,
      winningOutcomeId: WINNING_OUTCOME_ID,
      chain: {
        id: chainId,
        network: "base-sepolia",
        explorerUrl,
        treasuryAddress,
        tokenAddress,
      },
    },
    marketId: MARKET_ID,
    winningOutcomeId: WINNING_OUTCOME_ID,
    linkedWallet: {
      userId: DEMO_USER_ID,
      walletAddress: linkedWallet.walletAddress,
      verifiedAt: linkedWallet.verifiedAt,
      signature,
    },
    deposit: {
      txHash: depositResult.deposit.txHash,
      txExplorerUrl: toTxExplorerUrl(explorerUrl, depositResult.deposit.txHash),
      amount: depositResult.deposit.amount.toString(),
      status: depositResult.status,
      from: depositResult.deposit.txSender,
      to: depositResult.deposit.txRecipient,
      txStatus: depositResult.deposit.txStatus,
      tokenAddress: depositResult.deposit.tokenAddress,
      blockNumber: depositResult.deposit.blockNumber.toString(),
    },
    trading: {
      processedJobs,
      tradeId: trade.id,
      makerOrderId: restingOrder.order.id,
      takerOrderId: crossingOrder.order.id,
      makerOrderResult: persistedRestingOrder
        ? {
            id: persistedRestingOrder.id,
            status: persistedRestingOrder.status,
            remainingQuantity: persistedRestingOrder.remaining_quantity.toString(),
            reservedAmount: persistedRestingOrder.reserved_amount.toString(),
          }
        : null,
      takerOrderResult: persistedCrossingOrder
        ? {
            id: persistedCrossingOrder.id,
            status: persistedCrossingOrder.status,
            remainingQuantity: persistedCrossingOrder.remaining_quantity.toString(),
            reservedAmount: persistedCrossingOrder.reserved_amount.toString(),
          }
        : null,
    },
    openOrders: openOrders.map((row) => ({
      id: row.id,
      userId: row.user_id,
      side: row.side,
      status: row.status,
      remainingQuantity: row.remaining_quantity.toString(),
      reservedAmount: row.reserved_amount.toString(),
    })),
    trades: recentTrades.map((row) => ({
      id: row.id,
      makerUserId: row.maker_user_id,
      takerUserId: row.taker_user_id,
      price: row.price.toString(),
      quantity: row.quantity.toString(),
    })),
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
    resolution: resolutionSummary,
    claim: claimSummary
      ? {
          id: claimSummary.id,
          status: claimSummary.status,
          claimableAmount: claimSummary.claimable_amount.toString(),
          claimedAmount: claimSummary.claimed_amount.toString(),
          payoutJournalId: claimResult.payoutJournalId,
        }
      : null,
    withdrawalFlow: withdrawalSummary,
    withdrawals: withdrawals.map((row) => ({
      id: row.id,
      status: row.status,
      amount: row.amount.toString(),
      currency: row.currency,
      txHash: row.tx_hash,
      txExplorerUrl: row.tx_hash ? toTxExplorerUrl(explorerUrl, row.tx_hash) : null,
    })),
    reconciliation: {
      status: "not-run",
      note: "Use pnpm smoke:launch-proof to include reconciliation worker evidence in the artifact set.",
    },
  };

  const artifactJson = JSON.stringify(artifact, null, 2);

  const artifactPath = process.env.DB_HAPPY_PATH_ARTIFACT;
  if (artifactPath) {
    const artifactDir = path.dirname(artifactPath);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(artifactPath, `${artifactJson}\n`, "utf8");
  }

  console.log("db-happy-path: ok");
  console.log(artifactJson);
};

main().catch((error) => {
  const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error("db-happy-path: failed invariant/assertion");
  console.error(errorMessage);
  if (error instanceof InvariantError && error.context) {
    console.error("db-happy-path: invariant context");
    console.error(JSON.stringify(error.context, null, 2));
  }
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
