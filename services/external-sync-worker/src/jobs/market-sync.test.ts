import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseClient, DatabaseTransaction } from "@bet/db";

import { runMarketSyncJobWithDependencies, selectExternalSyncAdapters } from "./market-sync";

const createMockDb = () => {
  const marketIds = new Map<string, string>();
  const outcomes = new Set<string>();
  const trades = new Set<string>();

  let nextId = 1;

  const marketInsertValues: unknown[][] = [];
  const tradeInsertValues: unknown[][] = [];
  const orderbookTransactionStates: boolean[] = [];
  let transactionDepth = 0;

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

      if (statement.includes("insert into public.external_orderbook_snapshots")) {
        orderbookTransactionStates.push(transactionDepth > 0);
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
      transactionDepth += 1;
      try {
        return await callback(tx);
      } finally {
        transactionDepth -= 1;
      }
    },
  };

  return {
    db,
    marketInsertValues,
    tradeInsertValues,
    orderbookTransactionStates,
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
  imageUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/sample.png",
  iconUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/sample-icon.png",
  imageSourceUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/sample.png",
  imageUpdatedAt: "2026-01-01T00:00:00.000Z",
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

const withEnv = async (env: Record<string, string | undefined>, callback: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const createOrderbookSnapshot = (tokenId: string) => ({
  tokenId,
  tickSize: "0.01",
  minOrderSize: "5",
  bidsJson: [],
  asksJson: [],
  bestBid: null,
  bestAsk: null,
  lastTradePrice: null,
  capturedAt: "2026-01-01T00:00:00.000Z",
  rawJson: {},
  provenance: {
    source: "polymarket" as const,
    upstream: "clob.polymarket.com" as const,
    endpoint: `/book?token_id=${tokenId}`,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  },
});

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
  assert.equal(firstInsert[7], "https://polymarket-upload.s3.us-east-2.amazonaws.com/sample.png");
  assert.match(String(firstInsert[21]), /rawJson/);
  assert.match(String(firstInsert[23]), /gamma-api.polymarket.com/);
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

test("EXTERNAL_SYNC_SOURCE=polymarket selector only runs Polymarket adapter", async () => {
  const { db } = createMockDb();
  let polymarketCalls = 0;
  let kalshiCalls = 0;
  const allAdapters = [
    { source: "polymarket" as const, listMarkets: async () => { polymarketCalls += 1; return [sampleMarket]; } },
    { source: "kalshi" as const, listMarkets: async () => { kalshiCalls += 1; return [sampleMarket]; } },
  ];
  const adapters = selectExternalSyncAdapters("polymarket", allAdapters);

  const summary = await runMarketSyncJobWithDependencies({ db, adapters });

  assert.equal(polymarketCalls, 1);
  assert.equal(kalshiCalls, 0);
  assert.deepEqual(summary.sources.map((source) => source.source), ["polymarket"]);
});

test("EXTERNAL_SYNC_SKIP_ORDERBOOKS=true does not call orderbook fetcher", async () => {
  await withEnv({ EXTERNAL_SYNC_SKIP_ORDERBOOKS: "true", EXTERNAL_SYNC_ORDERBOOK_LIMIT: "5" }, async () => {
    const { db } = createMockDb();
    let orderbookCalls = 0;
    const adapter = { source: "polymarket" as const, listMarkets: async () => [sampleMarket] };

    await runMarketSyncJobWithDependencies({
      db,
      adapters: [adapter],
      orderbookFetcher: async (tokenId) => {
        orderbookCalls += 1;
        return createOrderbookSnapshot(tokenId);
      },
    });

    assert.equal(orderbookCalls, 0);
  });
});

test("market/outcome/trade upsert completes when orderbook fetch fails", async () => {
  await withEnv({ EXTERNAL_SYNC_ORDERBOOK_LIMIT: "5", EXTERNAL_SYNC_SKIP_ORDERBOOKS: undefined }, async () => {
    const { db, getCounts } = createMockDb();
    const adapter = { source: "polymarket" as const, listMarkets: async () => [sampleMarket] };

    const summary = await runMarketSyncJobWithDependencies({
      db,
      adapters: [adapter],
      orderbookFetcher: async () => {
        throw new Error("clob unavailable");
      },
    });

    assert.equal(summary.totals.marketsSynced, 1);
    assert.deepEqual(getCounts(), { markets: 1, outcomes: 1, trades: 1 });
  });
});

test("orderbook snapshot insert runs outside the market transaction", async () => {
  await withEnv({ EXTERNAL_SYNC_ORDERBOOK_LIMIT: "5", EXTERNAL_SYNC_SKIP_ORDERBOOKS: undefined }, async () => {
    const { db, orderbookTransactionStates } = createMockDb();
    const adapter = { source: "polymarket" as const, listMarkets: async () => [sampleMarket] };

    await runMarketSyncJobWithDependencies({
      db,
      adapters: [adapter],
      orderbookFetcher: async (tokenId) => createOrderbookSnapshot(tokenId),
    });

    assert.deepEqual(orderbookTransactionStates, [false]);
  });
});

test("sync logs progress", async () => {
  const { db } = createMockDb();
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (line?: unknown) => {
    messages.push(String(line));
  };

  try {
    const adapter = { source: "polymarket" as const, listMarkets: async () => [sampleMarket] };
    await runMarketSyncJobWithDependencies({ db, adapters: [adapter] });
  } finally {
    console.log = originalLog;
  }

  assert.ok(messages.some((line) => line.includes("external_sync.started")));
  assert.ok(messages.some((line) => line.includes("external_sync.source_started")));
  assert.ok(messages.some((line) => line.includes("external_sync.source_market_count_fetched")));
  assert.ok(messages.some((line) => line.includes("external_sync.source_completed")));
});

test("market limit is respected", async () => {
  await withEnv({ EXTERNAL_SYNC_MARKET_LIMIT: "1" }, async () => {
    const { db } = createMockDb();
    const secondMarket = { ...sampleMarket, externalId: "def", slug: "def", title: "Second" };
    const adapter = { source: "polymarket" as const, listMarkets: async () => [sampleMarket, secondMarket] };

    const summary = await runMarketSyncJobWithDependencies({ db, adapters: [adapter] });

    assert.equal(summary.totals.marketsSynced, 1);
  });
});
