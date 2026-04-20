import { createDatabaseClient } from "@bet/db";
import { logger } from "@bet/observability";

import { DEMO_USER_ID } from "../shared/constants";
import { insertAuditRecord } from "../shared/audit";

interface ResolutionRow {
  id: string;
  market_id: string;
  status: "pending" | "proposed" | "finalized" | "cancelled";
  winning_outcome_id: string | null;
  notes: string;
  resolved_at: Date | string | null;
}

export interface ResolveMarketInput {
  marketId: string;
  winningOutcomeId: string;
  notes?: string;
}

export interface ResolveMarketResult {
  resolutionId: string;
  marketId: string;
  status: ResolutionRow["status"];
  winningOutcomeId: string;
  resolvedAt: string;
}

const toIsoString = (value: Date | string | null): string =>
  value instanceof Date ? value.toISOString() : new Date(value ?? new Date()).toISOString();

export const resolveMarket = async (input: ResolveMarketInput): Promise<ResolveMarketResult> => {
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    await transaction.query(
      `
        update public.markets
        set
          status = 'resolved',
          resolve_time = now()
        where id = $1::uuid
      `,
      [input.marketId],
    );

    const [resolution] = await transaction.query<ResolutionRow>(
      `
        insert into public.resolutions (
          market_id,
          status,
          winning_outcome_id,
          notes,
          resolved_at,
          created_at,
          updated_at
        ) values (
          $1::uuid,
          'finalized',
          $2::uuid,
          $3,
          now(),
          now(),
          now()
        )
        on conflict (market_id)
        do update
        set
          status = 'finalized',
          winning_outcome_id = excluded.winning_outcome_id,
          notes = excluded.notes,
          resolved_at = excluded.resolved_at,
          updated_at = now()
        returning
          id,
          market_id,
          status,
          winning_outcome_id,
          notes,
          resolved_at
      `,
      [input.marketId, input.winningOutcomeId, input.notes ?? ""],
    );

    if (!resolution || !resolution.winning_outcome_id) {
      throw new Error("unable to finalize resolution");
    }

    logger.info("resolution performed", {
      marketId: input.marketId,
      resolutionId: resolution.id,
      winningOutcomeId: resolution.winning_outcome_id,
    });

    await insertAuditRecord(transaction, {
      actorUserId: DEMO_USER_ID,
      action: "admin.resolution.finalized",
      entityType: "resolution",
      entityId: resolution.id,
      metadata: {
        marketId: input.marketId,
        winningOutcomeId: resolution.winning_outcome_id,
        notes: input.notes ?? "",
      },
    });

    if ((input.notes ?? "").toLowerCase().includes("override")) {
      await insertAuditRecord(transaction, {
        actorUserId: DEMO_USER_ID,
        action: "admin.override.manual",
        entityType: "market",
        entityId: input.marketId,
        metadata: {
          reason: input.notes ?? "",
        },
      });
    }

    return {
      resolutionId: resolution.id,
      marketId: resolution.market_id,
      status: resolution.status,
      winningOutcomeId: resolution.winning_outcome_id,
      resolvedAt: toIsoString(resolution.resolved_at),
    };
  });
};
