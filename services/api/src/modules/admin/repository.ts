import type { DatabaseTransaction } from "@bet/db";

export interface ResolvableMarketSelection {
  marketId: string;
  marketStatus: "draft" | "open" | "halted" | "resolved" | "cancelled";
  outcomeId: string;
}

export interface ResolutionRecord {
  id: string;
  marketId: string;
  status: "pending" | "proposed" | "finalized" | "cancelled";
  winningOutcomeId: string | null;
  evidenceUrl: string | null;
  notes: string;
  resolvedAt: string | null;
}

interface ResolutionRow {
  id: string;
  market_id: string;
  status: ResolutionRecord["status"];
  winning_outcome_id: string | null;
  evidence_url: string | null;
  notes: string;
  resolved_at: Date | string | null;
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIso = (value: Date | string | null): string | null =>
  value ? toIsoString(value) : null;

const mapResolution = (row: ResolutionRow): ResolutionRecord => ({
  id: row.id,
  marketId: row.market_id,
  status: row.status,
  winningOutcomeId: row.winning_outcome_id,
  evidenceUrl: row.evidence_url,
  notes: row.notes,
  resolvedAt: toNullableIso(row.resolved_at),
});

export const getResolvableMarketSelection = async (
  transaction: DatabaseTransaction,
  input: { marketId: string; outcomeId: string },
): Promise<ResolvableMarketSelection | null> => {
  const [row] = await transaction.query<{
    market_id: string;
    market_status: ResolvableMarketSelection["marketStatus"];
    outcome_id: string;
  }>(
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
      for update of m
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

export const upsertFinalResolution = async (
  transaction: DatabaseTransaction,
  input: {
    marketId: string;
    winningOutcomeId: string;
    notes: string;
    evidenceUrl: string | null;
    resolvedAt: string;
  },
): Promise<ResolutionRecord> => {
  const [row] = await transaction.query<ResolutionRow>(
    `
      insert into public.resolutions (
        market_id,
        status,
        winning_outcome_id,
        evidence_url,
        notes,
        resolved_at,
        updated_at
      ) values (
        $1::uuid,
        'finalized',
        $2::uuid,
        $3,
        $4,
        $5::timestamptz,
        $5::timestamptz
      )
      on conflict (market_id)
      do update set
        status = 'finalized',
        winning_outcome_id = excluded.winning_outcome_id,
        evidence_url = excluded.evidence_url,
        notes = excluded.notes,
        resolved_at = excluded.resolved_at,
        updated_at = excluded.updated_at
      returning
        id,
        market_id,
        status,
        winning_outcome_id,
        evidence_url,
        notes,
        resolved_at
    `,
    [input.marketId, input.winningOutcomeId, input.evidenceUrl, input.notes, input.resolvedAt],
  );

  if (!row) {
    throw new Error("failed to persist market resolution");
  }

  return mapResolution(row);
};

export const markMarketResolved = async (
  transaction: DatabaseTransaction,
  input: { marketId: string; resolvedAt: string },
): Promise<void> => {
  await transaction.query(
    `
      update public.markets
      set status = 'resolved',
          resolve_time = $2::timestamptz,
          updated_at = $2::timestamptz
      where id = $1::uuid
    `,
    [input.marketId, input.resolvedAt],
  );
};
