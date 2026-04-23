import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseClient, DatabaseTransaction } from "@bet/db";

import { runMarketSyncJobWithDependencies } from "./market-sync";

const createMockDb = () => {
  const marketIds = new Map<string, string>();
  const outcomes = new Set<string>();
  const trades = new Set<string>();

  let nextId = 1;

  const marketInsertValues: unknown[][] = [];
  const tradeInsertValues: unknown[][] = [];

  const tx: DatabaseTransaction = {
    async query(statement, values = []) {
      if (statement.includes("public.orders") || statement.includes("public.positions") || statement.includes("public.ledger")) {
        throw new Error("internal trading tables must not be touched");
      }

      if (statement.includes("insert into public.external_markets")) {
        marketInsertValues.push([...values]);
        const key = `${values[0]}:${values[1]}`;
        if (!marketIds.has(key)) {
          marketIds.set(key, `market-${nextId++}`);
        }
        return [];
      }

      if (statement.includes("from public.external_markets") && statement.includes("where source = $1")) {
        const key = `${values[0]}:${values[1]}`;
        const id = marketIds.get(key);
        return id ? ([{ id }] as never) : [];
      }

      if (statement.includes("insert into public.external_outcomes")) {
        const key = `${values[0]}:${values[1]}`;
        outcomes.add(key);
        return [];
      }

      if (statement.includes("insert into public.external_trade_ticks")) {
        tradeInsertValues.push([...values]);
        const key = `${values[0]}:${values[1]}`;
        trades.add(key);
        return [];
      }

      if (statement.includes("insert into public.external_sync_checkpoints")) {
        return [];
      }

      if (statement.includes("from public.external_sync_checkpoints")) {
        return [];
      }

      return [];
    },
  };

  const db: DatabaseClient = {
    query: tx.query,
    async transaction(callback) {
      return callback(tx);
    },
  };

  return {
    db,
    marketInsertValues,
    tradeInsertValues,
    getCounts: () => ({ markets: marketIds.size, outcomes: outcomes.size, trades: trades.size }),
  };
};

const sampleMarket = {
  source: "polymarket" as const,
  externalId: "abc",
  slug: "abc",
  title: "Sample",
  description: "",
  url: null,
  status: "open" as const,
  closeTime: null,
  endTime: null,
  resolvedAt: null,
  bestBid: 0.4,
  bestAsk: 0.5,
  lastTradePrice: 0.45,
  volume24h: 10,
  volumeTotal: 100,
  outcomes: [
    {
      externalOutcomeId: "yes",
      title: "Yes",
      slug: "yes",
      outcomeIndex: 0,
      yesNo: "yes" as const,
      bestBid: 0.4,
      bestAsk: 0.5,
      lastPrice: 0.45,
      volume: 10,
    },
  ],
  recentTrades: [
    {
      tradeId: "trade-1",
      outcomeExternalId: "yes",
      side: "buy" as const,
      price: 0.45,
      size: 5,
      tradedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  rawPayload: { rawJson: { source: "test" }, provenance: { upstream: "gamma-api.polymarket.com" } },
};

test("market sync upsert path is idempotent for repeated runs", async () => {
  const { db, getCounts } = createMockDb();
  const adapter = {
    source: "polymarket" as const,
    listMarkets: async () => [sampleMarket],
  };

  const firstRun = await runMarketSyncJobWithDependencies({ db, adapters: [adapter] });
  const secondRun = await runMarketSyncJobWithDependencies({ db, adapters: [adapter] });

  const counts = getCounts();
  assert.equal(counts.markets, 1);
  assert.equal(counts.outcomes, 1);
  assert.equal(counts.trades, 1);
  assert.equal(firstRun.totals.marketsSynced, 1);
  assert.equal(firstRun.totals.outcomesSynced, 1);
  assert.equal(secondRun.sources[0]?.source, "polymarket");
});


test("market upsert stores raw payload/provenance and does not touch internal trading tables", async () => {
  const { db, marketInsertValues, tradeInsertValues } = createMockDb();
  const adapter = { source: "polymarket" as const, listMarkets: async () => [sampleMarket] };
  await runMarketSyncJobWithDependencies({ db, adapters: [adapter] });
  const firstInsert = marketInsertValues[0] ?? [];
  const firstTradeInsert = tradeInsertValues[0] ?? [];
  assert.match(String(firstInsert[15]), /rawJson/);
  assert.match(String(firstInsert[17]), /gamma-api.polymarket.com/);
  assert.equal(firstTradeInsert[3], "polymarket");
  assert.equal(firstTradeInsert[6], "450000");
  assert.equal(firstTradeInsert[8], "5000000");
  assert.match(String(firstTradeInsert[12]), /data-api\.polymarket\.com|gamma-api\.polymarket\.com/);
});

test("sync failure in one source rejects without mutating internal state", async () => {
  const { db } = createMockDb();
  const badAdapter = { source: "polymarket" as const, listMarkets: async () => { throw new Error("boom"); } };
  await assert.rejects(() => runMarketSyncJobWithDependencies({ db, adapters: [badAdapter] }));
});
