import { createDatabaseClient } from "@bet/db";

import { DEMO_USER_ID } from "../shared/constants";
import {
  getClaimForUpdate,
  getResolvedMarketForClaim,
  getWinningPositionQuantity,
  insertClaim,
  insertClaimPayoutJournal,
  listClaimsForUser,
  listFinalizedResolvedMarkets,
  type ClaimRow,
} from "./repository";

export interface ClaimableState {
  marketId: string;
  resolutionId: string | null;
  claimableAmount: bigint;
  claimedAmount: bigint;
  status: "blocked" | "claimable" | "claimed";
}

export interface ClaimMarketResult {
  claim: ClaimRow;
  payoutJournalId: string;
}

const computeClaimableAmount = (input: {
  winningPositionQuantity: bigint;
  maxPrice: bigint;
}): bigint => input.winningPositionQuantity * input.maxPrice;

const assertMarketClaimable = (input: {
  marketStatus: string;
  resolutionStatus: string;
  winningOutcomeId: string | null;
}): void => {
  if (input.marketStatus !== "resolved") {
    throw new Error("market is not resolved");
  }

  if (input.resolutionStatus !== "finalized" || !input.winningOutcomeId) {
    throw new Error("market resolution is not finalized");
  }
};

export const getClaimableStateForMarket = async (
  input: { userId: string; marketId: string },
): Promise<ClaimableState> => {
  const db = createDatabaseClient();

  const market = await getResolvedMarketForClaim(db, input.marketId);

  if (!market) {
    throw new Error("market not found");
  }

  if (
    market.status !== "resolved" ||
    market.resolutionStatus !== "finalized" ||
    !market.winningOutcomeId
  ) {
    return {
      marketId: input.marketId,
      resolutionId: market.resolutionId,
      claimableAmount: 0n,
      claimedAmount: 0n,
      status: "blocked",
    };
  }

  const winningPositionQuantity = await getWinningPositionQuantity(db, {
    userId: input.userId,
    marketId: input.marketId,
    winningOutcomeId: market.winningOutcomeId,
  });

  const claimableAmount = computeClaimableAmount({
    winningPositionQuantity,
    maxPrice: market.maxPrice,
  });

  const existing = (await listClaimsForUser(db, input.userId)).find((claim) => claim.marketId === input.marketId);

  if (!existing) {
    return {
      marketId: input.marketId,
      resolutionId: market.resolutionId,
      claimableAmount,
      claimedAmount: 0n,
      status: claimableAmount > 0n ? "claimable" : "blocked",
    };
  }

  return {
    marketId: input.marketId,
    resolutionId: existing.resolutionId,
    claimableAmount: claimableAmount > existing.claimedAmount ? claimableAmount - existing.claimedAmount : 0n,
    claimedAmount: existing.claimedAmount,
    status: existing.status === "claimed" ? "claimed" : claimableAmount > existing.claimedAmount ? "claimable" : "blocked",
  };
};

export const claimMarket = async (input: { marketId: string; userId?: string }): Promise<ClaimMarketResult> => {
  const userId = input.userId ?? DEMO_USER_ID;
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const market = await getResolvedMarketForClaim(transaction, input.marketId);

    if (!market) {
      throw new Error("market not found");
    }

    assertMarketClaimable({
      marketStatus: market.status,
      resolutionStatus: market.resolutionStatus,
      winningOutcomeId: market.winningOutcomeId,
    });

    const existingClaim = await getClaimForUpdate(transaction, {
      userId,
      marketId: input.marketId,
    });

    if (existingClaim && existingClaim.status === "claimed") {
      throw new Error("claim already submitted for this market");
    }

    const winningOutcomeId = market.winningOutcomeId as string;

    const winningPositionQuantity = await getWinningPositionQuantity(transaction, {
      userId,
      marketId: input.marketId,
      winningOutcomeId,
    });

    const claimableAmount = computeClaimableAmount({
      winningPositionQuantity,
      maxPrice: market.maxPrice,
    });

    if (claimableAmount <= 0n) {
      throw new Error("no claimable payout for this market");
    }

    if (existingClaim && existingClaim.claimedAmount >= claimableAmount) {
      throw new Error("claim already submitted for this market");
    }

    const claimedAmount = existingClaim
      ? claimableAmount - existingClaim.claimedAmount
      : claimableAmount;

    const claimedAt = new Date().toISOString();
    const claim = await insertClaim(transaction, {
      userId,
      marketId: input.marketId,
      resolutionId: market.resolutionId,
      claimableAmount,
      claimedAmount,
      status: "claimed",
      createdAt: claimedAt,
    });

    const payoutJournalId = crypto.randomUUID();

    await insertClaimPayoutJournal(transaction, {
      journalId: payoutJournalId,
      createdAt: claimedAt,
      reference: `claim:${claim.id}:payout`,
      metadata: {
        claimId: claim.id,
        marketId: input.marketId,
        userId,
      },
      userId,
      marketId: input.marketId,
      currency: market.collateralCurrency,
      amount: claimedAmount,
    });

    return {
      claim,
      payoutJournalId,
    };
  });
};

export const getClaims = async (input?: { userId?: string }) => {
  const userId = input?.userId ?? DEMO_USER_ID;
  const db = createDatabaseClient();
  const [claims, resolvedMarkets] = await Promise.all([
    listClaimsForUser(db, userId),
    listFinalizedResolvedMarkets(db),
  ]);

  const claimsByMarketId = new Map(claims.map((claim) => [claim.marketId, claim] as const));

  const states = await Promise.all(
    resolvedMarkets.map(async (market) => {
      if (!market.winningOutcomeId || market.resolutionStatus !== "finalized") {
        return {
          marketId: market.marketId,
          resolutionId: market.resolutionId,
          claimableAmount: 0n,
          claimedAmount: 0n,
          status: "blocked" as const,
        };
      }

      const quantity = await getWinningPositionQuantity(db, {
        userId,
        marketId: market.marketId,
        winningOutcomeId: market.winningOutcomeId,
      });
      const totalClaimable = computeClaimableAmount({
        winningPositionQuantity: quantity,
        maxPrice: market.maxPrice,
      });
      const existing = claimsByMarketId.get(market.marketId);
      const claimedAmount = existing?.claimedAmount ?? 0n;
      const claimableAmount = totalClaimable > claimedAmount ? totalClaimable - claimedAmount : 0n;

      return {
        marketId: market.marketId,
        resolutionId: market.resolutionId,
        claimableAmount,
        claimedAmount,
        status:
          existing?.status === "claimed"
            ? ("claimed" as const)
            : claimableAmount > 0n
              ? ("claimable" as const)
              : ("blocked" as const),
      };
    }),
  );

  return {
    claims,
    states,
  };
};
