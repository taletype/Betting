import { createDatabaseClient } from "@bet/db";
import { logger } from "@bet/observability";

import { DEMO_USER_ID } from "../shared/constants";
import {
  markIdempotencyReplay,
  persistIdempotencyResponse,
  reserveIdempotencyKey,
} from "../shared/idempotency";
import { insertAuditRecord } from "../shared/audit";
import { toJson } from "../../presenters/json";

interface ClaimRow {
  id: string;
  user_id: string;
  market_id: string;
  resolution_id: string | null;
  claimable_amount: bigint;
  claimed_amount: bigint;
  status: "pending" | "claimable" | "claimed" | "blocked";
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateClaimInput {
  marketId: string;
  idempotencyKey: string;
}

export interface ClaimResult {
  claimId: string;
  marketId: string;
  userId: string;
  claimedAmount: bigint;
  status: ClaimRow["status"];
  updatedAt: string;
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const createClaim = async (input: CreateClaimInput): Promise<{ status: number; body: string }> => {
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const idempotency = await reserveIdempotencyKey(transaction, {
      scope: `claims:${input.marketId}`,
      key: input.idempotencyKey,
      requestHash: input.marketId,
    });

    if (idempotency.isReplay && idempotency.response) {
      await markIdempotencyReplay(transaction, {
        scope: `claims:${input.marketId}`,
        key: input.idempotencyKey,
      });

      await insertAuditRecord(transaction, {
        actorUserId: DEMO_USER_ID,
        action: "idempotency.replay",
        entityType: "claim",
        entityId: input.marketId,
        metadata: {
          scope: `claims:${input.marketId}`,
          idempotencyKey: input.idempotencyKey,
          replayCount: idempotency.response.replayCount,
        },
      });

      logger.info("claim idempotency replay", {
        marketId: input.marketId,
        idempotencyKey: input.idempotencyKey,
      });

      return {
        status: idempotency.response.status,
        body: idempotency.response.body,
      };
    }

    const [claim] = await transaction.query<ClaimRow>(
      `
        update public.claims
        set
          claimed_amount = claimable_amount,
          status = case
            when claimable_amount > 0 then 'claimed'
            else status
          end,
          updated_at = now()
        where user_id = $1::uuid
          and market_id = $2::uuid
          and status in ('claimable', 'claimed')
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
      [DEMO_USER_ID, input.marketId],
    );

    if (!claim) {
      throw new Error("no claimable position found for market");
    }

    const result: ClaimResult = {
      claimId: claim.id,
      marketId: claim.market_id,
      userId: claim.user_id,
      claimedAmount: claim.claimed_amount,
      status: claim.status,
      updatedAt: toIsoString(claim.updated_at),
    };

    logger.info("claim created", {
      claimId: claim.id,
      marketId: claim.market_id,
      userId: claim.user_id,
      claimedAmount: claim.claimed_amount.toString(),
    });

    await insertAuditRecord(transaction, {
      actorUserId: DEMO_USER_ID,
      action: "claim.create",
      entityType: "claim",
      entityId: claim.id,
      metadata: {
        marketId: claim.market_id,
        claimedAmount: claim.claimed_amount.toString(),
        status: claim.status,
      },
    });

    const responseBody = toJson({ claim: result });

    await persistIdempotencyResponse(transaction, {
      scope: `claims:${input.marketId}`,
      key: input.idempotencyKey,
      responseStatus: 200,
      responseBody,
    });

    return {
      status: 200,
      body: responseBody,
    };
  });
};
