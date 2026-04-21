import type { DatabaseClient, DatabaseExecutor } from "@bet/db";
import { createDatabaseClient } from "@bet/db";
import { incrementCounter, logger, observeDuration, recordGauge } from "@bet/observability";
import {
  createKalshiAdapter,
  createPolymarketAdapter,
  type ExternalMarketAdapter,
  type NormalizedExternalMarket,
} from "@bet/integrations";

const db = createDatabaseClient();

const defaultAdapters: ExternalMarketAdapter[] = [createPolymarketAdapter(), createKalshiAdapter()];
const isExternalSyncWritesDisabled = (): boolean =>
  (process.env.OP_DISABLE_EXTERNAL_SYNC_WRITES ?? "").trim().toLowerCase() === "true";

export const upsertMarket = async (database: DatabaseClient, market: NormalizedExternalMarket): Promise<void> => {
  await database.transaction(async (tx) => {
    await tx.query(
      `
        insert into public.external_markets (
          source,
          external_id,
          slug,
          title,
          description,
          status,
          market_url,
          close_time,
          end_time,
          resolved_at,
          best_bid,
          best_ask,
          last_trade_price,
          volume_24h,
          volume_total,
          raw_payload,
          last_synced_at,
          updated_at
        ) values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16::jsonb,
          now(),
          now()
        )
        on conflict (source, external_id)
        do update set
          slug = excluded.slug,
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          market_url = excluded.market_url,
          close_time = excluded.close_time,
          end_time = excluded.end_time,
          resolved_at = excluded.resolved_at,
          best_bid = excluded.best_bid,
          best_ask = excluded.best_ask,
          last_trade_price = excluded.last_trade_price,
          volume_24h = excluded.volume_24h,
          volume_total = excluded.volume_total,
          raw_payload = excluded.raw_payload,
          last_synced_at = now(),
          updated_at = now()
      `,
      [
        market.source,
        market.externalId,
        market.slug,
        market.title,
        market.description,
        market.status,
        market.url,
        market.closeTime,
        market.endTime,
        market.resolvedAt,
        market.bestBid,
        market.bestAsk,
        market.lastTradePrice,
        market.volume24h,
        market.volumeTotal,
        JSON.stringify(market.rawPayload ?? {}),
      ],
    );

    const marketRows = await tx.query<{ id: string }>(
      `
        select id
        from public.external_markets
        where source = $1 and external_id = $2
        limit 1
      `,
      [market.source, market.externalId],
    );

    const marketId = marketRows[0]?.id;
    if (!marketId) {
      throw new Error(`failed to load upserted external market ${market.source}:${market.externalId}`);
    }

    for (const outcome of market.outcomes) {
      await tx.query(
        `
          insert into public.external_outcomes (
            external_market_id,
            external_outcome_id,
            title,
            slug,
            outcome_index,
            yes_no,
            best_bid,
            best_ask,
            last_price,
            volume,
            updated_at
          ) values (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            now()
          )
          on conflict (external_market_id, external_outcome_id)
          do update set
            title = excluded.title,
            slug = excluded.slug,
            outcome_index = excluded.outcome_index,
            yes_no = excluded.yes_no,
            best_bid = excluded.best_bid,
            best_ask = excluded.best_ask,
            last_price = excluded.last_price,
            volume = excluded.volume,
            updated_at = now()
        `,
        [
          marketId,
          outcome.externalOutcomeId,
          outcome.title,
          outcome.slug,
          outcome.outcomeIndex,
          outcome.yesNo,
          outcome.bestBid,
          outcome.bestAsk,
          outcome.lastPrice,
          outcome.volume,
        ],
      );
    }

    for (const tick of market.recentTrades) {
      await tx.query(
        `
          insert into public.external_trade_ticks (
            external_market_id,
            external_trade_id,
            external_outcome_id,
            side,
            price,
            size,
            traded_at,
            raw_payload
          ) values (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            coalesce($7::timestamptz, now()),
            $8::jsonb
          )
          on conflict (external_market_id, external_trade_id)
          do update set
            external_outcome_id = excluded.external_outcome_id,
            side = excluded.side,
            price = excluded.price,
            size = excluded.size,
            traded_at = excluded.traded_at,
            raw_payload = excluded.raw_payload
        `,
        [
          marketId,
          tick.tradeId,
          tick.outcomeExternalId,
          tick.side,
          tick.price,
          tick.size,
          tick.tradedAt,
          JSON.stringify(tick),
        ],
      );
    }
  });
};

const getPreviousCheckpointLagMs = async (database: DatabaseExecutor, source: string): Promise<number | null> => {
  const rows = await database.query<{ synced_at: string }>(
    `
      select synced_at
      from public.external_sync_checkpoints
      where source = $1 and checkpoint_key = 'last_market_sync'
      limit 1
    `,
    [source],
  );

  const syncedAt = rows[0]?.synced_at;
  if (!syncedAt) {
    return null;
  }

  return Date.now() - new Date(syncedAt).getTime();
};

const recordCheckpoint = async (database: DatabaseExecutor, source: string, syncedCount: number): Promise<void> => {
  await database.query(
    `
      insert into public.external_sync_checkpoints (source, checkpoint_key, checkpoint_value, synced_at)
      values ($1, 'last_market_sync', $2::jsonb, now())
      on conflict (source, checkpoint_key)
      do update set checkpoint_value = excluded.checkpoint_value, synced_at = now()
    `,
    [
      source,
      JSON.stringify({
        syncedCount,
        syncedAt: new Date().toISOString(),
      }),
    ],
  );
};

export interface MarketSyncDependencies {
  db: DatabaseClient;
  adapters: ExternalMarketAdapter[];
}

export const runMarketSyncJobWithDependencies = async ({ db: database, adapters }: MarketSyncDependencies): Promise<void> => {
  for (const adapter of adapters) {
    const syncStartedAt = Date.now();
    logger.info("external sync started", { source: adapter.source });

    try {
      const previousLagMs = await getPreviousCheckpointLagMs(database, adapter.source);
      const markets = await adapter.listMarkets();

      let outcomesSynced = 0;
      let tradesSynced = 0;
      for (const market of markets) {
        outcomesSynced += market.outcomes.length;
        tradesSynced += market.recentTrades.length;
        await upsertMarket(database, market);
      }

      await recordCheckpoint(database, adapter.source, markets.length);

      observeDuration("external_sync_duration_ms", Date.now() - syncStartedAt, {
        source: adapter.source,
      });
      incrementCounter("external_sync_runs_total", {
        source: adapter.source,
        status: "success",
      });
      recordGauge("external_sync_markets_synced", markets.length, {
        source: adapter.source,
      });
      recordGauge("external_sync_outcomes_synced", outcomesSynced, {
        source: adapter.source,
      });
      recordGauge("external_sync_trade_ticks_synced", tradesSynced, {
        source: adapter.source,
      });
      if (previousLagMs !== null) {
        recordGauge("external_sync_lag_ms", previousLagMs, {
          source: adapter.source,
        });
      }

      logger.info("external sync completed", {
        source: adapter.source,
        syncedCount: markets.length,
        outcomesSynced,
        tradesSynced,
        previousLagMs,
      });
    } catch (error) {
      incrementCounter("external_sync_runs_total", {
        source: adapter.source,
        status: "failed",
      });
      logger.error("external sync failed", {
        source: adapter.source,
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    }
  }
};

export const runMarketSyncJob = async (): Promise<void> => {
  if (isExternalSyncWritesDisabled()) {
    console.log("external sync worker: writes disabled via OP_DISABLE_EXTERNAL_SYNC_WRITES=true");
    return;
  }

  await runMarketSyncJobWithDependencies({
    db,
    adapters: defaultAdapters,
  });
};
