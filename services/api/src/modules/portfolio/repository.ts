import type {
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

  return {
    balances,
    openOrders: await listOpenOrdersForUser(db, userId),
    positions: await listPositionsForUser(userId),
    claims: [],
  };
};
