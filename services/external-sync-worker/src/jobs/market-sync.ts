import type { DatabaseClient, DatabaseExecutor } from "@bet/db";
import { createDatabaseClient } from "@bet/db";
import { fetchPolymarketOrderBook, type NormalizedExternalMarket } from "@bet/integrations";
import { createKalshiAdapter, createPolymarketAdapter, type ExternalMarketAdapter } from "@bet/integrations";
import { incrementCounter, logger, observeDuration, recordGauge } from "@bet/observability";

const db = createDatabaseClient();
const EXTERNAL_PRICE_SCALE = 1_000_000;
const EXTERNAL_SIZE_SCALE = 1_000_000;

const defaultAdapters: ExternalMarketAdapter[] = [createPolymarketAdapter(), createKalshiAdapter()];
const isExternalSyncWritesDisabled = (): boolean =>
  (process.env.OP_DISABLE_EXTERNAL_SYNC_WRITES ?? "").trim().toLowerCase() === "true";

const toScaledIntegerString = (value: number | null, scale: number): string | null => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return String(Math.round(value * scale));
};

export const upsertMarket = async (database: DatabaseClient, market: NormalizedExternalMarket): Promise<void> => {
  await database.transaction(async (tx) => {
    const rawJson = (market.rawPayload as { rawJson?: unknown })?.rawJson ?? market.rawPayload ?? {};
    const sourceProvenance = (market.rawPayload as { provenance?: unknown })?.provenance ?? {};

    await tx.query(
      `
        insert into public.external_markets (
          source, external_id, slug, title, description, status, market_url,
          close_time, end_time, resolved_at, best_bid, best_ask, last_trade_price,
          volume_24h, volume_total, raw_payload, raw_json, source_provenance,
          last_synced_at, last_seen_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16::jsonb, $17::jsonb, $18::jsonb,
          now(), now(), now()
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
          raw_json = excluded.raw_json,
          source_provenance = excluded.source_provenance,
          last_synced_at = now(),
          last_seen_at = now(),
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
        JSON.stringify(rawJson),
        JSON.stringify(sourceProvenance),
      ],
    );

    const marketRows = await tx.query<{ id: string }>(
      `select id from public.external_markets where source = $1 and external_id = $2 limit 1`,
      [market.source, market.externalId],
    );

    const marketId = marketRows[0]?.id;
    if (!marketId) throw new Error(`failed to load upserted external market ${market.source}:${market.externalId}`);

    for (const outcome of market.outcomes) {
      await tx.query(
        `
          insert into public.external_outcomes (
            external_market_id, external_outcome_id, title, slug, outcome_index, yes_no,
            best_bid, best_ask, last_price, volume, raw_json, source_provenance,
            last_seen_at, updated_at
          ) values (
            $1::uuid, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11::jsonb, $12::jsonb,
            now(), now()
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
            raw_json = excluded.raw_json,
            source_provenance = excluded.source_provenance,
            last_seen_at = now(),
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
          JSON.stringify(outcome),
          JSON.stringify(sourceProvenance),
        ],
      );
    }

    for (const tick of market.recentTrades) {
      const tickRawJson = tick.rawJson ?? tick;
      const tickSourceProvenance = tick.sourceProvenance ?? sourceProvenance;

      await tx.query(
        `
          insert into public.external_trade_ticks (
            external_market_id, external_trade_id, external_outcome_id, source, side,
            price, price_ppm, size, size_atoms,
            traded_at, executed_at,
            raw_payload, raw_json, source_provenance, last_seen_at
          ) values (
            $1::uuid, $2, $3, $4, $5,
            $6, $7::bigint, $8, $9::bigint,
            coalesce($10::timestamptz, now()), coalesce($10::timestamptz, now()),
            $11::jsonb, $12::jsonb, $13::jsonb, now()
          )
          on conflict (external_market_id, external_trade_id)
          do update set
            external_outcome_id = excluded.external_outcome_id,
            source = excluded.source,
            side = excluded.side,
            price = excluded.price,
            price_ppm = excluded.price_ppm,
            size = excluded.size,
            size_atoms = excluded.size_atoms,
            traded_at = excluded.traded_at,
            executed_at = excluded.executed_at,
            raw_payload = excluded.raw_payload,
            raw_json = excluded.raw_json,
            source_provenance = excluded.source_provenance,
            last_seen_at = now()
        `,
        [
          marketId,
          tick.tradeId,
          tick.outcomeExternalId,
          market.source,
          tick.side,
          tick.price,
          toScaledIntegerString(tick.price, EXTERNAL_PRICE_SCALE),
          tick.size,
          toScaledIntegerString(tick.size, EXTERNAL_SIZE_SCALE),
          tick.tradedAt,
          JSON.stringify(tick),
          JSON.stringify(tickRawJson),
          JSON.stringify(tickSourceProvenance),
        ],
      );
    }

    if (market.source === "polymarket") {
      for (const outcome of market.outcomes) {
        if (!outcome.externalOutcomeId) continue;
        try {
          const snapshot = await fetchPolymarketOrderBook(outcome.externalOutcomeId);
          await tx.query(
            `
              insert into public.external_orderbook_snapshots (
                external_market_id, external_outcome_id, source, bids_json, asks_json,
                captured_at, last_trade_price, best_bid, best_ask, raw_json, source_provenance
              ) values (
                $1::uuid, $2, $3, $4::jsonb, $5::jsonb,
                $6::timestamptz, $7, $8, $9, $10::jsonb, $11::jsonb
              )
            `,
            [
              marketId,
              outcome.externalOutcomeId,
              market.source,
              JSON.stringify(snapshot.bidsJson),
              JSON.stringify(snapshot.asksJson),
              snapshot.capturedAt,
              snapshot.lastTradePrice,
              snapshot.bestBid,
              snapshot.bestAsk,
              JSON.stringify(snapshot.rawJson),
              JSON.stringify(snapshot.provenance),
            ],
          );
        } catch (error) {
          logger.error("external sync clob snapshot failed", {
            source: market.source,
            marketExternalId: market.externalId,
            outcomeExternalId: outcome.externalOutcomeId,
            error: error instanceof Error ? error.message : "unknown error",
          });
        }
      }
    }
  });
};

const getPreviousCheckpointLagMs = async (database: DatabaseExecutor, source: string): Promise<number | null> => {
  const rows = await database.query<{ synced_at: string }>(
    `select synced_at from public.external_sync_checkpoints where source = $1 and checkpoint_key = 'last_market_sync' limit 1`,
    [source],
  );
  const syncedAt = rows[0]?.synced_at;
  return syncedAt ? Date.now() - new Date(syncedAt).getTime() : null;
};

const recordCheckpoint = async (database: DatabaseExecutor, source: string, syncedCount: number): Promise<void> => {
  await database.query(
    `
      insert into public.external_sync_checkpoints (source, checkpoint_key, checkpoint_value, synced_at)
      values ($1, 'last_market_sync', $2::jsonb, now())
      on conflict (source, checkpoint_key)
      do update set checkpoint_value = excluded.checkpoint_value, synced_at = now()
    `,
    [source, JSON.stringify({ syncedCount, syncedAt: new Date().toISOString() })],
  );
};

export interface MarketSyncDependencies {
  db: DatabaseClient;
  adapters: ExternalMarketAdapter[];
}
export interface ExternalSyncSourceSummary {
  source: string;
  marketsSynced: number;
  outcomesSynced: number;
  tradesSynced: number;
  checkpointRecordedAt: string;
  durationMs: number;
  previousLagMs: number | null;
}
export interface ExternalSyncRunSummary {
  startedAt: string;
  completedAt: string;
  sources: ExternalSyncSourceSummary[];
  totals: { marketsSynced: number; outcomesSynced: number; tradesSynced: number };
}

export const runMarketSyncJobWithDependencies = async ({ db: database, adapters }: MarketSyncDependencies): Promise<ExternalSyncRunSummary> => {
  const startedAt = new Date().toISOString();
  const sources: ExternalSyncSourceSummary[] = [];

  for (const adapter of adapters) {
    const syncStartedAt = Date.now();
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
      const durationMs = Date.now() - syncStartedAt;
      const checkpointRecordedAt = new Date().toISOString();
      observeDuration("external_sync_duration_ms", durationMs, { source: adapter.source });
      incrementCounter("external_sync_runs_total", { source: adapter.source, status: "success" });
      recordGauge("external_sync_markets_synced", markets.length, { source: adapter.source });
      recordGauge("external_sync_outcomes_synced", outcomesSynced, { source: adapter.source });
      recordGauge("external_sync_trade_ticks_synced", tradesSynced, { source: adapter.source });
      sources.push({ source: adapter.source, marketsSynced: markets.length, outcomesSynced, tradesSynced, checkpointRecordedAt, durationMs, previousLagMs });
    } catch (error) {
      incrementCounter("external_sync_runs_total", { source: adapter.source, status: "failed" });
      throw error;
    }
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    sources,
    totals: sources.reduce((acc, source) => ({
      marketsSynced: acc.marketsSynced + source.marketsSynced,
      outcomesSynced: acc.outcomesSynced + source.outcomesSynced,
      tradesSynced: acc.tradesSynced + source.tradesSynced,
    }), { marketsSynced: 0, outcomesSynced: 0, tradesSynced: 0 }),
  };
};

export const runMarketSyncJob = async (source?: string): Promise<ExternalSyncRunSummary> => {
  if (isExternalSyncWritesDisabled()) {
    const timestamp = new Date().toISOString();
    return { startedAt: timestamp, completedAt: timestamp, sources: [], totals: { marketsSynced: 0, outcomesSynced: 0, tradesSynced: 0 } };
  }
  const adapters = source ? defaultAdapters.filter((adapter) => adapter.source === source) : defaultAdapters;
  return runMarketSyncJobWithDependencies({ db, adapters });
};
