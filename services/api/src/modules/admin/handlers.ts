import { createDatabaseClient } from "@bet/db";

import { getResolvableMarketSelection, markMarketResolved, upsertFinalResolution, type ResolutionRecord } from "./repository";

export interface ResolveMarketInput {
  marketId: string;
  winningOutcomeId: string;
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

export const resolveMarket = async (input: ResolveMarketInput): Promise<ResolveMarketResult> => {
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
