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

import {
  getResolvableMarketSelection,
  markMarketResolved,
  upsertFinalResolution,
  type ResolutionRecord,
} from "./repository";

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
  evidenceText: string;
  evidenceUrl: string | null;
  resolverId: string;
  isAdmin: boolean;
}

export interface ResolveMarketResult {
  marketId: string;
  status: "resolved";
  resolution: ResolutionRecord;
}

const RESOLVABLE_STATUSES = new Set(["open", "halted"]);

const buildResolutionNotes = (input: {
  evidenceText: string;
  resolverId: string;
  resolvedAt: string;
}): string => [
  `resolver: ${input.resolverId}`,
  `resolved_at: ${input.resolvedAt}`,
  "evidence:",
  input.evidenceText,
].join("\n");

export const resolveMarket = async (
  input: ResolveMarketInput,
): Promise<ResolveMarketResult> => {
  if (!input.isAdmin) {
    throw new Error("admin authorization is required");
  }

  if (!input.winningOutcomeId) {
    throw new Error("winning outcome id is required");
  }

  if (!input.evidenceText.trim()) {
    throw new Error("evidence text is required");
  }

  if (!input.resolverId.trim()) {
    throw new Error("resolver identity is required");
  }

  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const selection = await getResolvableMarketSelection(transaction, {
      marketId: input.marketId,
      outcomeId: input.winningOutcomeId,
    });

    if (!selection) {
      throw new Error("market or winning outcome not found");
    }

    if (!RESOLVABLE_STATUSES.has(selection.marketStatus)) {
      throw new Error("market is not in a resolvable state");
    }

    const resolvedAt = new Date().toISOString();
    const resolution = await upsertFinalResolution(transaction, {
      marketId: input.marketId,
      winningOutcomeId: input.winningOutcomeId,
      evidenceUrl: input.evidenceUrl,
      notes: buildResolutionNotes({
        resolverId: input.resolverId,
        evidenceText: input.evidenceText.trim(),
        resolvedAt,
      }),
      resolvedAt,
    });

    await markMarketResolved(transaction, {
      marketId: input.marketId,
      resolvedAt,
    });

    return {
      marketId: input.marketId,
      status: "resolved",
      resolution,
    };
  });
};
