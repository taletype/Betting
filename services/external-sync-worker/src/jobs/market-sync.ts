import { createDatabaseClient } from "@bet/db";
import {
  createKalshiAdapter,
  createPolymarketAdapter,
  type ExternalMarketAdapter,
  type NormalizedExternalMarket,
} from "@bet/integrations";

const db = createDatabaseClient();

const adapters: ExternalMarketAdapter[] = [createPolymarketAdapter(), createKalshiAdapter()];

const upsertMarket = async (market: NormalizedExternalMarket): Promise<void> => {
  await db.transaction(async (tx) => {
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

const recordCheckpoint = async (source: string, syncedCount: number): Promise<void> => {
  await db.query(
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

export const runMarketSyncJob = async (): Promise<void> => {
  for (const adapter of adapters) {
    const markets = await adapter.listMarkets();

    for (const market of markets) {
      await upsertMarket(market);
    }

    await recordCheckpoint(adapter.source, markets.length);
  }
};
