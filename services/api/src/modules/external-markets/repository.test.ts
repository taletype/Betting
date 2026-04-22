import assert from "node:assert/strict";
import test from "node:test";

import { createExternalMarketsRepository } from "./repository";

test("repository list/detail map synced external market rows", async () => {
  const db = {
    async query(statement: string) {
      if (statement.includes("from public.external_markets") && statement.includes("limit 500")) {
        return [
          {
            id: "m1",
            source: "polymarket",
            external_id: "123",
            slug: "will-it-rain",
            title: "Will it rain?",
            description: "desc",
            status: "open",
            market_url: "https://polymarket.com/event/will-it-rain",
            close_time: null,
            end_time: null,
            resolved_at: null,
            best_bid: "0.42",
            best_ask: "0.44",
            last_trade_price: "0.43",
            volume_24h: "100",
            volume_total: "1000",
            last_synced_at: "2026-01-01T00:00:00.000Z",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }

      if (statement.includes("from public.external_markets") && statement.includes("where source = $1")) {
        return [
          {
            id: "m1",
            source: "polymarket",
            external_id: "123",
            slug: "will-it-rain",
            title: "Will it rain?",
            description: "desc",
            status: "open",
            market_url: "https://polymarket.com/event/will-it-rain",
            close_time: null,
            end_time: null,
            resolved_at: null,
            best_bid: "0.42",
            best_ask: "0.44",
            last_trade_price: "0.43",
            volume_24h: "100",
            volume_total: "1000",
            last_synced_at: "2026-01-01T00:00:00.000Z",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }

      if (statement.includes("from public.external_outcomes")) {
        return [
          {
            external_market_id: "m1",
            external_outcome_id: "yes",
            title: "Yes",
            slug: "yes",
            outcome_index: 0,
            yes_no: "yes",
            best_bid: "0.42",
            best_ask: "0.44",
            last_price: "0.43",
            volume: "100",
          },
        ];
      }

      if (statement.includes("from public.external_orderbook_snapshots")) {
        return [
          {
            external_market_id: "m1",
            external_outcome_id: "yes",
            bids_json: [{ price: "0.42", size: "100" }],
            asks_json: [{ price: "0.44", size: "120" }],
            captured_at: "2026-01-01T00:00:00.000Z",
            last_trade_price: "0.43",
            best_bid: "0.42",
            best_ask: "0.44",
          },
        ];
      }

      if (statement.includes("from public.external_trade_ticks")) {
        return [
          {
            external_market_id: "m1",
            external_trade_id: "t1",
            external_outcome_id: "yes",
            side: "buy",
            price: "0.43",
            size: "10",
            traded_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }

      return [];
    },
  };

  const repository = createExternalMarketsRepository(db as never);

  const markets = await repository.listExternalMarketRecords();
  assert.equal(markets.length, 1);
  assert.equal(markets[0]?.outcomes.length, 1);
  assert.equal(markets[0]?.recentTrades.length, 1);
  assert.equal(markets[0]?.latestOrderbook.length, 1);

  const detail = await repository.getExternalMarketRecord("polymarket", "123");
  assert.equal(detail?.externalId, "123");
  assert.equal(detail?.outcomes[0]?.title, "Yes");
});

test("repository returns empty list and null detail when no rows exist", async () => {
  const db = {
    async query() {
      return [];
    },
  };

  const repository = createExternalMarketsRepository(db as never);

  const markets = await repository.listExternalMarketRecords();
  const detail = await repository.getExternalMarketRecord("kalshi", "missing");

  assert.equal(markets.length, 0);
  assert.equal(detail, null);
});
