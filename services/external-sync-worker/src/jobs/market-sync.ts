import type { DatabaseClient, DatabaseExecutor } from "@bet/db";
import { createDatabaseClient } from "@bet/db";
import { fetchPolymarketOrderBook, type NormalizedExternalMarket } from "@bet/integrations";
import { createKalshiAdapter, createPolymarketAdapter, type ExternalMarketAdapter } from "@bet/integrations";
import { incrementCounter, logger, observeDuration, recordGauge } from "@bet/observability";

const db = createDatabaseClient();
const EXTERNAL_PRICE_SCALE = 1_000_000;
const EXTERNAL_SIZE_SCALE = 1_000_000;
const DEFAULT_MARKET_LIMIT = 100;
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const DEFAULT_ORDERBOOK_TIMEOUT_MS = 5_000;
const DEFAULT_ORDERBOOK_LIMIT = 0;

const defaultAdapters: ExternalMarketAdapter[] = [createPolymarketAdapter(), createKalshiAdapter()];
export const selectExternalSyncAdapters = (
  source: string | undefined,
  adapters: ExternalMarketAdapter[] = defaultAdapters,
): ExternalMarketAdapter[] => (source ? adapters.filter((adapter) => adapter.source === source) : adapters);

const isExternalSyncWritesDisabled = (): boolean =>
  (process.env.OP_DISABLE_EXTERNAL_SYNC_WRITES ?? "").trim().toLowerCase() === "true";
const isOrderbookSyncSkipped = (): boolean =>
  (process.env.EXTERNAL_SYNC_SKIP_ORDERBOOKS ?? "").trim().toLowerCase() === "true";

const parseNonNegativeIntegerEnv = (name: string, defaultValue: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  if (timeoutMs <= 0) return promise;
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const toScaledIntegerString = (value: number | null, scale: number): string | null => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return String(Math.round(value * scale));
};

const getOutcomePricesJson = (market: NormalizedExternalMarket): Array<{ outcome: string; tokenId: string; price: number | null }> =>
  market.outcomes.map((outcome) => ({
    outcome: outcome.title,
    tokenId: outcome.externalOutcomeId,
    price: outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid,
  }));

export const upsertMarket = async (database: DatabaseClient, market: NormalizedExternalMarket): Promise<string> => {
  return database.transaction(async (tx) => {
    const rawJson = (market.rawPayload as { rawJson?: unknown })?.rawJson ?? market.rawPayload ?? {};
    const sourceProvenance = (market.rawPayload as { provenance?: unknown })?.provenance ?? {};
    const outcomePrices = getOutcomePricesJson(market);
    const observedAt = new Date().toISOString();

    await tx.query(
      `
        insert into public.external_markets (
          source, external_id, slug, title, question, description, status, resolution_status, market_url, source_url,
          outcomes, outcome_prices,
          close_time, end_time, resolved_at, best_bid, best_ask, last_trade_price,
          volume_24h, volume_total, volume, liquidity, raw_payload, raw_json, source_provenance,
          last_synced_at, last_seen_at, updated_at
        ) values (
          $1, $2, $3, $4, $4, $5, $6, $6, $7, $7,
          $8::jsonb, $9::jsonb,
          $10, $11, $12, $13, $14, $15,
          $16, $17, $17, $17, $18::jsonb, $19::jsonb, $20::jsonb,
          now(), now(), now()
        )
        on conflict (source, external_id)
        do update set
          slug = excluded.slug,
          title = excluded.title,
          question = excluded.question,
          description = excluded.description,
          status = excluded.status,
          resolution_status = excluded.resolution_status,
          market_url = excluded.market_url,
          source_url = excluded.source_url,
          outcomes = excluded.outcomes,
          outcome_prices = excluded.outcome_prices,
          close_time = excluded.close_time,
          end_time = excluded.end_time,
          resolved_at = excluded.resolved_at,
          best_bid = excluded.best_bid,
          best_ask = excluded.best_ask,
          last_trade_price = excluded.last_trade_price,
          volume_24h = excluded.volume_24h,
          volume_total = excluded.volume_total,
          volume = excluded.volume,
          liquidity = excluded.liquidity,
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
        JSON.stringify(market.outcomes),
        JSON.stringify(outcomePrices),
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

    await tx.query(
      `
        insert into public.external_market_prices (
          market_id, source, observed_at, outcome_prices, best_bid, best_ask,
          last_trade_price, volume, liquidity, raw_json, source_provenance
        ) values (
          $1::uuid, $2, $3::timestamptz, $4::jsonb, $5, $6,
          $7, $8, $9, $10::jsonb, $11::jsonb
        )
        on conflict (market_id, observed_at)
        do update set
          outcome_prices = excluded.outcome_prices,
          best_bid = excluded.best_bid,
          best_ask = excluded.best_ask,
          last_trade_price = excluded.last_trade_price,
          volume = excluded.volume,
          liquidity = excluded.liquidity,
          raw_json = excluded.raw_json,
          source_provenance = excluded.source_provenance
      `,
      [
        marketId,
        market.source,
        observedAt,
        JSON.stringify(outcomePrices),
        market.bestBid,
        market.bestAsk,
        market.lastTradePrice,
        market.volumeTotal,
        market.volumeTotal,
        JSON.stringify(rawJson),
        JSON.stringify(sourceProvenance),
      ],
    );

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

      await tx.query(
        `
          insert into public.external_trades (
            market_id, source, external_trade_id, external_outcome_id, side,
            price, price_ppm, size, size_atoms,
            executed_at, raw_json, source_provenance, last_seen_at, updated_at
          ) values (
            $1::uuid, $2, $3, $4, $5,
            $6, $7::bigint, $8, $9::bigint,
            coalesce($10::timestamptz, now()), $11::jsonb, $12::jsonb, now(), now()
          )
          on conflict (source, external_trade_id)
          do update set
            market_id = excluded.market_id,
            external_outcome_id = excluded.external_outcome_id,
            side = excluded.side,
            price = excluded.price,
            price_ppm = excluded.price_ppm,
            size = excluded.size,
            size_atoms = excluded.size_atoms,
            executed_at = excluded.executed_at,
            raw_json = excluded.raw_json,
            source_provenance = excluded.source_provenance,
            last_seen_at = now(),
            updated_at = now()
        `,
        [
          marketId,
          market.source,
          tick.tradeId,
          tick.outcomeExternalId,
          tick.side,
          tick.price,
          toScaledIntegerString(tick.price, EXTERNAL_PRICE_SCALE),
          tick.size,
          toScaledIntegerString(tick.size, EXTERNAL_SIZE_SCALE),
          tick.tradedAt,
          JSON.stringify(tickRawJson),
          JSON.stringify(tickSourceProvenance),
        ],
      );
    }
    return marketId;
  });
};

const syncOrderbookSnapshots = async (
  database: DatabaseClient,
  market: NormalizedExternalMarket,
  marketId: string,
  options: { orderbookLimit: number; orderbookTimeoutMs: number; orderbookFetcher: typeof fetchPolymarketOrderBook },
): Promise<number> => {
  if (market.source !== "polymarket") return 0;

  const outcomes = market.outcomes.filter((outcome) => outcome.externalOutcomeId).slice(0, options.orderbookLimit);
  if (outcomes.length === 0) return 0;

  let fetched = 0;
  for (const outcome of outcomes) {
    try {
      const snapshot = await withTimeout(
        options.orderbookFetcher(outcome.externalOutcomeId),
        options.orderbookTimeoutMs,
        `polymarket orderbook ${outcome.externalOutcomeId}`,
      );
      await database.query(
        `
          insert into public.external_orderbook_snapshots (
            external_market_id, market_id, external_outcome_id, source, bids_json, asks_json,
            captured_at, observed_at, last_trade_price, best_bid, best_ask, raw_json, source_provenance
          ) values (
            $1::uuid, $1::uuid, $2, $3, $4::jsonb, $5::jsonb,
            $6::timestamptz, $6::timestamptz, $7, $8, $9, $10::jsonb, $11::jsonb
          )
          on conflict (market_id, observed_at)
          do update set
            bids_json = excluded.bids_json,
            asks_json = excluded.asks_json,
            last_trade_price = excluded.last_trade_price,
            best_bid = excluded.best_bid,
            best_ask = excluded.best_ask,
            raw_json = excluded.raw_json,
            source_provenance = excluded.source_provenance
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
      fetched += 1;
      logger.info("external_sync.orderbook_fetched", {
        source: market.source,
        marketExternalId: market.externalId,
        outcomeExternalId: outcome.externalOutcomeId,
      });
    } catch (error) {
      logger.error("external_sync.orderbook_failed", {
        source: market.source,
        marketExternalId: market.externalId,
        outcomeExternalId: outcome.externalOutcomeId,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return fetched;
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

const startSyncRun = async (database: DatabaseExecutor, source: string, syncKind: string): Promise<string | null> => {
  try {
    await database.query(
      `
        update public.external_market_sync_runs
        set status = 'failure',
            finished_at = now(),
            error_message = 'superseded by a newer sync run'
        where source = $1
          and sync_kind = $2
          and status = 'running'
      `,
      [source, syncKind],
    );
    const [row] = await database.query<{ id: string }>(
      `
        insert into public.external_market_sync_runs (source, sync_kind, status, started_at)
        values ($1, $2, 'running', now())
        returning id
      `,
      [source, syncKind],
    );
    return row?.id ?? null;
  } catch (error) {
    logger.error("external_sync.audit_start_failed", {
      source,
      syncKind,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
};

const finishSyncRun = async (
  database: DatabaseExecutor,
  input: {
    runId: string | null;
    status: "success" | "partial" | "failure" | "skipped";
    marketsSeen?: number;
    marketsUpserted?: number;
    errorMessage?: string | null;
    diagnostics?: Record<string, unknown>;
  },
): Promise<void> => {
  if (!input.runId) return;

  try {
    await database.query(
      `
        update public.external_market_sync_runs
        set status = $2,
            finished_at = now(),
            markets_seen = $3,
            markets_upserted = $4,
            error_message = $5,
            diagnostics = $6::jsonb
        where id = $1::uuid
      `,
      [
        input.runId,
        input.status,
        input.marketsSeen ?? 0,
        input.marketsUpserted ?? 0,
        input.errorMessage ?? null,
        JSON.stringify(input.diagnostics ?? {}),
      ],
    );
  } catch (error) {
    logger.error("external_sync.audit_finish_failed", {
      runId: input.runId,
      status: input.status,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
};

export interface MarketSyncDependencies {
  db: DatabaseClient;
  adapters: ExternalMarketAdapter[];
  orderbookFetcher?: typeof fetchPolymarketOrderBook;
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

export const runMarketSyncJobWithDependencies = async ({ db: database, adapters, orderbookFetcher = fetchPolymarketOrderBook }: MarketSyncDependencies): Promise<ExternalSyncRunSummary> => {
  const startedAt = new Date().toISOString();
  const sources: ExternalSyncSourceSummary[] = [];
  const marketLimit = parseNonNegativeIntegerEnv("EXTERNAL_SYNC_MARKET_LIMIT", DEFAULT_MARKET_LIMIT);
  const httpTimeoutMs = parseNonNegativeIntegerEnv("EXTERNAL_SYNC_HTTP_TIMEOUT_MS", DEFAULT_HTTP_TIMEOUT_MS);
  const orderbookTimeoutMs = parseNonNegativeIntegerEnv("EXTERNAL_SYNC_ORDERBOOK_TIMEOUT_MS", DEFAULT_ORDERBOOK_TIMEOUT_MS);
  const orderbookLimit = parseNonNegativeIntegerEnv("EXTERNAL_SYNC_ORDERBOOK_LIMIT", DEFAULT_ORDERBOOK_LIMIT);
  const skipOrderbooks = isOrderbookSyncSkipped() || orderbookLimit === 0;

  logger.info("external_sync.started", {
    sources: adapters.map((adapter) => adapter.source),
    marketLimit,
    httpTimeoutMs,
    orderbookTimeoutMs,
    orderbookLimit,
    skipOrderbooks,
  });

  for (const adapter of adapters) {
    const syncStartedAt = Date.now();
    const syncKind = adapter.source === "polymarket" ? "polymarket_market_metadata_sync" : "market_metadata_sync";
    const runId = await startSyncRun(database, adapter.source, syncKind);
    try {
      logger.info("external_sync.source_started", { source: adapter.source });
      const previousLagMs = await getPreviousCheckpointLagMs(database, adapter.source);
      const fetchedMarkets = await withTimeout(adapter.listMarkets(), httpTimeoutMs, `${adapter.source} market list`);
      const markets = marketLimit === 0 ? [] : fetchedMarkets.slice(0, marketLimit);
      logger.info("external_sync.source_market_count_fetched", {
        source: adapter.source,
        fetchedCount: fetchedMarkets.length,
        limitedCount: markets.length,
      });
      let outcomesSynced = 0;
      let tradesSynced = 0;
      let upsertedMarkets = 0;
      for (const market of markets) {
        outcomesSynced += market.outcomes.length;
        tradesSynced += market.recentTrades.length;
        const marketId = await upsertMarket(database, market);
        upsertedMarkets += 1;
        if (upsertedMarkets % 25 === 0) {
          logger.info("external_sync.markets_upserted", { source: adapter.source, upsertedMarkets, totalMarkets: markets.length });
        }

        if (market.source === "polymarket") {
          if (skipOrderbooks) {
            logger.info("external_sync.orderbook_skipped", {
              source: market.source,
              marketExternalId: market.externalId,
              reason: isOrderbookSyncSkipped() ? "EXTERNAL_SYNC_SKIP_ORDERBOOKS" : "EXTERNAL_SYNC_ORDERBOOK_LIMIT",
            });
          } else {
            await syncOrderbookSnapshots(database, market, marketId, { orderbookLimit, orderbookTimeoutMs, orderbookFetcher });
          }
        }
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
      await finishSyncRun(database, {
        runId,
        status: "success",
        marketsSeen: fetchedMarkets.length,
        marketsUpserted: upsertedMarkets,
        diagnostics: {
          syncKind,
          outcomesSynced,
          tradesSynced,
          orderbooksSkipped: skipOrderbooks,
          cadence: {
            metadata: "5-15 minutes",
            hotMarketPrices: "15-60 seconds",
            orderbookSnapshots: "30-120 seconds",
            recentTrades: "1-5 minutes",
            staleness: "1-5 minutes",
          },
        },
      });
      logger.info("external_sync.source_completed", { source: adapter.source, marketsSynced: markets.length, outcomesSynced, tradesSynced, durationMs });
    } catch (error) {
      incrementCounter("external_sync_runs_total", { source: adapter.source, status: "failed" });
      await finishSyncRun(database, {
        runId,
        status: "failure",
        errorMessage: error instanceof Error ? error.message : "unknown error",
        diagnostics: { syncKind },
      });
      logger.error("external_sync.source_failed", {
        source: adapter.source,
        error: error instanceof Error ? error.message : "unknown error",
      });
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
  const adapters = selectExternalSyncAdapters(source);
  return runMarketSyncJobWithDependencies({ db, adapters });
};

export const runPolymarketMarketMetadataSyncJob = (): Promise<ExternalSyncRunSummary> =>
  runMarketSyncJob("polymarket");

export const runPolymarketMarketPriceSyncJob = (): Promise<ExternalSyncRunSummary> =>
  runMarketSyncJob("polymarket");

export const runPolymarketOrderbookSnapshotSyncJob = (): Promise<ExternalSyncRunSummary> =>
  runMarketSyncJob("polymarket");

export const runPolymarketRecentTradesSyncJob = (): Promise<ExternalSyncRunSummary> =>
  runMarketSyncJob("polymarket");

export const runPolymarketStalenessCheckJob = async (): Promise<ExternalSyncRunSummary> => {
  const startedAt = new Date().toISOString();
  await db.query(
    `
      insert into public.external_market_sync_runs (
        source, sync_kind, status, started_at, finished_at, diagnostics
      ) values (
        'polymarket',
        'polymarket_staleness_check',
        'success',
        now(),
        now(),
        jsonb_build_object(
          'staleMarketCount',
          (
            select count(*)
            from public.external_markets
            where source = 'polymarket'
              and coalesce(last_seen_at, last_synced_at, updated_at) < now() - interval '15 minutes'
          )
        )
      )
    `,
  );
  return {
    startedAt,
    completedAt: new Date().toISOString(),
    sources: [{
      source: "polymarket",
      marketsSynced: 0,
      outcomesSynced: 0,
      tradesSynced: 0,
      checkpointRecordedAt: new Date().toISOString(),
      durationMs: 0,
      previousLagMs: null,
    }],
    totals: { marketsSynced: 0, outcomesSynced: 0, tradesSynced: 0 },
  };
};
