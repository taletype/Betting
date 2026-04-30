import { createDatabaseClient } from "@bet/db";
import { logger } from "@bet/observability";

export interface PolymarketBuilderAttributionSyncResult {
  status: "skipped" | "completed";
  checkedAttempts: number;
  confirmedAttributions: number;
  rewardsCreated: number;
  checkedAt: string;
}

export const polymarketBuilderAttributionSyncJobName = "polymarket_builder_attribution_sync";

export const runPolymarketBuilderAttributionSync = async (): Promise<PolymarketBuilderAttributionSyncResult> => {
  const checkedAt = new Date().toISOString();

  if (process.env.POLYMARKET_BUILDER_ATTRIBUTION_SYNC_ENABLED !== "true") {
    return { status: "skipped", checkedAttempts: 0, confirmedAttributions: 0, rewardsCreated: 0, checkedAt };
  }

  const db = createDatabaseClient();
  const attempts = await db.query<{ id: string; polymarket_order_id: string | null }>(
    `
      select id, polymarket_order_id
      from public.polymarket_routed_order_audits
      where polymarket_order_id is not null
      order by created_at desc
      limit 100
    `,
  );

  logger.info("polymarket_builder_attribution_sync.scaffolded", {
    checkedAttempts: attempts.length,
  });

  // Intentionally no reward creation here until official V2 builder attribution evidence
  // is wired in and matched idempotently to local routed order attempts.
  return {
    status: "completed",
    checkedAttempts: attempts.length,
    confirmedAttributions: 0,
    rewardsCreated: 0,
    checkedAt,
  };
};
