import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseClient, DatabaseTransaction } from "@bet/db";

import { runMarketSyncJobWithDependencies } from "./market-sync";

const createMockDb = () => {
  const marketIds = new Map<string, string>();
  const outcomes = new Set<string>();
  const trades = new Set<string>();

  let nextId = 1;

  const tx: DatabaseTransaction = {
    async query(statement, values = []) {
      if (statement.includes("insert into public.external_markets")) {
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

  return { db, getCounts: () => ({ markets: marketIds.size, outcomes: outcomes.size, trades: trades.size }) };
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
  rawPayload: { source: "test" },
};

test("market sync upsert path is idempotent for repeated runs", async () => {
  const { db, getCounts } = createMockDb();
  const adapter = {
    source: "polymarket" as const,
    listMarkets: async () => [sampleMarket],
  };

  await runMarketSyncJobWithDependencies({ db, adapters: [adapter] });
  await runMarketSyncJobWithDependencies({ db, adapters: [adapter] });

  const counts = getCounts();
  assert.equal(counts.markets, 1);
  assert.equal(counts.outcomes, 1);
  assert.equal(counts.trades, 1);
});
