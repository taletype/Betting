import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";

export interface ResolvedMarketRow {
  marketId: string;
  status: "draft" | "open" | "halted" | "resolved" | "cancelled";
  collateralCurrency: string;
  maxPrice: bigint;
  resolutionId: string;
  resolutionStatus: "pending" | "proposed" | "finalized" | "cancelled";
  winningOutcomeId: string | null;
}

export interface ClaimRow {
  id: string;
  userId: string;
  marketId: string;
  resolutionId: string | null;
  claimableAmount: bigint;
  claimedAmount: bigint;
  status: "pending" | "claimable" | "claimed" | "blocked";
  createdAt: string;
  updatedAt: string;
}

interface ClaimDbRow {
  id: string;
  user_id: string;
  market_id: string;
  resolution_id: string | null;
  claimable_amount: bigint;
  claimed_amount: bigint;
  status: ClaimRow["status"];
  created_at: Date | string;
  updated_at: Date | string;
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapClaim = (row: ClaimDbRow): ClaimRow => ({
  id: row.id,
  userId: row.user_id,
  marketId: row.market_id,
  resolutionId: row.resolution_id,
  claimableAmount: row.claimable_amount,
  claimedAmount: row.claimed_amount,
  status: row.status,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
});

export const getResolvedMarketForClaim = async (
  executor: DatabaseExecutor,
  marketId: string,
): Promise<ResolvedMarketRow | null> => {
  const [row] = await executor.query<{
    market_id: string;
    market_status: ResolvedMarketRow["status"];
    collateral_currency: string;
    max_price: bigint;
    resolution_id: string;
    resolution_status: ResolvedMarketRow["resolutionStatus"];
    winning_outcome_id: string | null;
  }>(
    `
      select
        m.id as market_id,
        m.status as market_status,
        m.collateral_currency,
        m.max_price,
        r.id as resolution_id,
        r.status as resolution_status,
        r.winning_outcome_id
      from public.markets m
      join public.resolutions r on r.market_id = m.id
      where m.id = $1::uuid
      limit 1
    `,
    [marketId],
  );

  if (!row) {
    return null;
  }

  return {
    marketId: row.market_id,
    status: row.market_status,
    collateralCurrency: row.collateral_currency,
    maxPrice: row.max_price,
    resolutionId: row.resolution_id,
    resolutionStatus: row.resolution_status,
    winningOutcomeId: row.winning_outcome_id,
  };
};

export const getWinningPositionQuantity = async (
  executor: DatabaseExecutor,
  input: { userId: string; marketId: string; winningOutcomeId: string },
): Promise<bigint> => {
  const [row] = await executor.query<{ net_quantity: bigint }>(
    `
      select net_quantity
      from public.positions
      where user_id = $1::uuid
        and market_id = $2::uuid
        and outcome_id = $3::uuid
      limit 1
    `,
    [input.userId, input.marketId, input.winningOutcomeId],
  );

  if (!row || row.net_quantity <= 0n) {
    return 0n;
  }

  return row.net_quantity;
};

export const getClaimForUpdate = async (
  transaction: DatabaseTransaction,
  input: { userId: string; marketId: string },
): Promise<ClaimRow | null> => {
  const [row] = await transaction.query<ClaimDbRow>(
    `
      select
        id,
        user_id,
        market_id,
        resolution_id,
        claimable_amount,
        claimed_amount,
        status,
        created_at,
        updated_at
      from public.claims
      where user_id = $1::uuid
        and market_id = $2::uuid
      order by created_at desc, id desc
      limit 1
      for update
    `,
    [input.userId, input.marketId],
  );

  return row ? mapClaim(row) : null;
};

export const insertClaim = async (
  transaction: DatabaseTransaction,
  input: {
    userId: string;
    marketId: string;
    resolutionId: string;
    claimableAmount: bigint;
    claimedAmount: bigint;
    status: ClaimRow["status"];
    createdAt: string;
  },
): Promise<ClaimRow> => {
  const [row] = await transaction.query<ClaimDbRow>(
    `
      insert into public.claims (
        user_id,
        market_id,
        resolution_id,
        claimable_amount,
        claimed_amount,
        status,
        created_at,
        updated_at
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6,
        $7::timestamptz,
        $7::timestamptz
      )
      returning
        id,
        user_id,
        market_id,
        resolution_id,
        claimable_amount,
        claimed_amount,
        status,
        created_at,
        updated_at
    `,
    [
      input.userId,
      input.marketId,
      input.resolutionId,
      input.claimableAmount,
      input.claimedAmount,
      input.status,
      input.createdAt,
    ],
  );

  if (!row) {
    throw new Error("failed to persist claim");
  }

  return mapClaim(row);
};

export const insertClaimPayoutJournal = async (
  transaction: DatabaseTransaction,
  input: {
    journalId: string;
    createdAt: string;
    reference: string;
    metadata: Record<string, string>;
    userId: string;
    marketId: string;
    currency: string;
    amount: bigint;
  },
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
        'claim_payout',
        $2,
        $3::jsonb,
        $4::timestamptz
      )
    `,
    [input.journalId, input.reference, JSON.stringify(input.metadata), input.createdAt],
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
        ($1::uuid, $2, 'debit', $3, $4, $5::timestamptz),
        ($1::uuid, $6, 'credit', $3, $4, $5::timestamptz)
    `,
    [
      input.journalId,
      `user:${input.userId}:funds:available`,
      input.amount,
      input.currency,
      input.createdAt,
      `market:${input.marketId}:payout_pool`,
    ],
  );
};

export const listClaimsForUser = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<ClaimRow[]> => {
  const rows = await executor.query<ClaimDbRow>(
    `
      select
        id,
        user_id,
        market_id,
        resolution_id,
        claimable_amount,
        claimed_amount,
        status,
        created_at,
        updated_at
      from public.claims
      where user_id = $1::uuid
      order by created_at desc, id desc
    `,
    [userId],
  );

  return rows.map((row) => mapClaim(row));
};

export const listFinalizedResolvedMarkets = async (
  executor: DatabaseExecutor,
): Promise<ResolvedMarketRow[]> => {
  const rows = await executor.query<{
    market_id: string;
    market_status: ResolvedMarketRow["status"];
    collateral_currency: string;
    max_price: bigint;
    resolution_id: string;
    resolution_status: ResolvedMarketRow["resolutionStatus"];
    winning_outcome_id: string | null;
  }>(
    `
      select
        m.id as market_id,
        m.status as market_status,
        m.collateral_currency,
        m.max_price,
        r.id as resolution_id,
        r.status as resolution_status,
        r.winning_outcome_id
      from public.markets m
      join public.resolutions r on r.market_id = m.id
      where m.status = 'resolved'
      order by m.resolve_time desc nulls last, m.created_at desc
    `,
  );

  return rows.map((row) => ({
    marketId: row.market_id,
    status: row.market_status,
    collateralCurrency: row.collateral_currency,
    maxPrice: row.max_price,
    resolutionId: row.resolution_id,
    resolutionStatus: row.resolution_status,
    winningOutcomeId: row.winning_outcome_id,
  }));
};
