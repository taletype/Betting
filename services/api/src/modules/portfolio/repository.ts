import type { Order } from "@bet/contracts";
import { createDatabaseClient } from "@bet/db";

import { DEFAULT_COLLATERAL_CURRENCY } from "../shared/constants";
import { listOpenOrdersForUser } from "../orders/repository";

interface PortfolioBalanceRow {
  currency: string;
  available: bigint;
  reserved: bigint;
}

const db = createDatabaseClient();

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildReservedFundsAccountCode = (userId: string): string => `user:${userId}:funds:reserved`;

export interface PortfolioBalance {
  currency: string;
  available: bigint;
  reserved: bigint;
}

export interface PortfolioSnapshot {
  balances: PortfolioBalance[];
  openOrders: Order[];
}

export const getPortfolioSnapshot = async (userId: string): Promise<PortfolioSnapshot> => {
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

  const balances =
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
  };
};
