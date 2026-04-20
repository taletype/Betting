import type {
  DepositRecord,
  LinkedWallet,
  PortfolioBalance as ContractPortfolioBalance,
  PortfolioSnapshot as ContractPortfolioSnapshot,
  Position,
} from "@bet/contracts";
import { createDatabaseClient } from "@bet/db";

import { DEFAULT_COLLATERAL_CURRENCY } from "../shared/constants";
import { listOpenOrdersForUser } from "../orders/repository";

interface PortfolioBalanceRow {
  currency: string;
  available: bigint;
  reserved: bigint;
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

interface LinkedWalletRow {
  id: string;
  chain: "base";
  wallet_address: string;
  verified_at: Date | string;
}

interface DepositRow {
  id: string;
  chain: "base";
  tx_hash: string;
  tx_sender: string;
  tx_recipient: string;
  token_address: string;
  amount: bigint;
  currency: string;
  tx_status: "confirmed" | "rejected";
  block_number: bigint;
  created_at: Date | string;
  verified_at: Date | string;
}

const db = createDatabaseClient();

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildReservedFundsAccountCode = (userId: string): string => `user:${userId}:funds:reserved`;

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapPositionRow = (row: PositionRow): Position => ({
  id: row.id,
  userId: row.user_id,
  marketId: row.market_id,
  outcomeId: row.outcome_id,
  netQuantity: row.net_quantity,
  averageEntryPrice: row.average_entry_price,
  realizedPnl: row.realized_pnl,
  updatedAt: toIsoString(row.updated_at),
});

const mapLinkedWalletRow = (row: LinkedWalletRow): LinkedWallet => ({
  id: row.id,
  chain: row.chain,
  walletAddress: row.wallet_address,
  verifiedAt: toIsoString(row.verified_at),
});

const mapDepositRow = (row: DepositRow): DepositRecord => ({
  id: row.id,
  chain: row.chain,
  txHash: row.tx_hash,
  txSender: row.tx_sender,
  txRecipient: row.tx_recipient,
  tokenAddress: row.token_address,
  amount: row.amount,
  currency: row.currency,
  txStatus: row.tx_status,
  blockNumber: row.block_number,
  createdAt: toIsoString(row.created_at),
  verifiedAt: toIsoString(row.verified_at),
});

const listPositionsForUser = async (userId: string): Promise<Position[]> => {
  const rows = await db.query<PositionRow>(
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
        and net_quantity <> 0
      order by updated_at desc, id desc
    `,
    [userId],
  );

  return rows.map((row) => mapPositionRow(row));
};

const getLinkedWalletForUser = async (userId: string): Promise<LinkedWallet | null> => {
  const [row] = await db.query<LinkedWalletRow>(
    `
      select
        id,
        chain,
        wallet_address,
        verified_at
      from public.linked_wallets
      where user_id = $1::uuid
      limit 1
    `,
    [userId],
  );

  return row ? mapLinkedWalletRow(row) : null;
};

const listDepositsForUser = async (userId: string): Promise<DepositRecord[]> => {
  const rows = await db.query<DepositRow>(
    `
      select
        id,
        chain,
        tx_hash,
        tx_sender,
        tx_recipient,
        token_address,
        amount,
        currency,
        tx_status,
        block_number,
        created_at,
        verified_at
      from public.chain_deposits
      where user_id = $1::uuid
      order by created_at desc, id desc
    `,
    [userId],
  );

  return rows.map((row) => mapDepositRow(row));
};

export const getPortfolioSnapshot = async (
  userId: string,
): Promise<ContractPortfolioSnapshot> => {
  const balanceRows = await db.query<PortfolioBalanceRow>(
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
    `,
    [buildAvailableFundsAccountCode(userId), buildReservedFundsAccountCode(userId)],
  );

  const balances: ContractPortfolioBalance[] =
    balanceRows.length > 0
      ? balanceRows.map((row) => ({
          currency: row.currency,
          available: row.available,
          reserved: row.reserved,
        }))
      : [
          {
            currency: DEFAULT_COLLATERAL_CURRENCY,
            available: 0n,
            reserved: 0n,
          },
        ];

  const [openOrders, positions, linkedWallet, deposits] = await Promise.all([
    listOpenOrdersForUser(db, userId),
    listPositionsForUser(userId),
    getLinkedWalletForUser(userId),
    listDepositsForUser(userId),
  ]);

  return {
    balances,
    openOrders,
    positions,
    claims: [],
    linkedWallet,
    deposits,
  };
};
