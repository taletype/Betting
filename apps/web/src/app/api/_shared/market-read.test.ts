import assert from "node:assert/strict";
import test from "node:test";
import { readMarketById, readMarketOrderBook, readMarkets, readMarketTrades } from "./market-read";

type QueryState = {
  table: "markets" | "outcomes";
  marketId?: string;
  marketIds?: string[];
};

const createMockSupabase = () => {
  const markets = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      slug: "market-1",
      title: "Will it rain?",
      description: "Rain in SF",
      status: "open",
      collateral_currency: "USDC",
      min_price: 1n,
      max_price: 99,
      tick_size: 1,
      close_time: new Date("2026-01-01T00:00:00.000Z"),
      resolve_time: null,
      created_at: "2025-12-31T00:00:00.000Z",
    },
  ];

  const outcomes = [
    {
      id: "22222222-2222-2222-2222-222222222222",
      market_id: "11111111-1111-1111-1111-111111111111",
      slug: "yes",
      title: "Yes",
      outcome_index: 0,
      created_at: new Date("2025-12-31T00:00:00.000Z"),
    },
  ];

  const resolveQuery = (query: QueryState) => {
    if (query.table === "markets") {
      const data = query.marketId ? markets.find((market) => market.id === query.marketId) ?? null : markets;
      return Promise.resolve({ data, error: null });
    }

    const filtered = query.marketIds
      ? outcomes.filter((outcome) => query.marketIds?.includes(outcome.market_id))
      : outcomes.filter((outcome) => outcome.market_id === query.marketId);

    return Promise.resolve({ data: filtered, error: null });
  };

  return {
    from(table: "markets" | "outcomes") {
      const query: QueryState = { table };
      return {
        select() {
          return this;
        },
        order() {
          return this;
        },
        in(column: string, marketIds: string[]) {
          if (column === "market_id") {
            query.marketIds = marketIds;
          }
          return this;
        },
        eq(column: string, value: string) {
          if ((column === "id" && table === "markets") || (column === "market_id" && table === "outcomes")) {
            query.marketId = value;
          }
          return this;
        },
        maybeSingle() {
          return resolveQuery(query);
        },
        then(onFulfilled: (value: { data: unknown; error: null }) => unknown) {
          return resolveQuery(query).then(onFulfilled);
        },
      };
    },
    rpc(functionName: string) {
      if (functionName === "rpc_get_market_orderbook") {
        return Promise.resolve({
          data: { levels: [{ outcomeId: 12n, side: "buy", priceTicks: 42n, quantityAtoms: 99 }] },
          error: null,
        });
      }

      return Promise.resolve({
        data: {
          trades: [
            {
              id: 5n,
              outcomeId: "22222222-2222-2222-2222-222222222222",
              priceTicks: 42n,
              quantityAtoms: 10n,
              takerSide: "sell",
              executedAt: new Date("2026-01-02T00:00:00.000Z"),
            },
          ],
        },
        error: null,
      });
    },
  };
};

test("readMarkets/readMarketById/readMarketOrderBook/readMarketTrades return normalized contract-shaped payloads", async () => {
  const supabase = createMockSupabase();
  const marketList = await readMarkets(supabase as never);
  const marketDetail = await readMarketById(supabase as never, "11111111-1111-1111-1111-111111111111");
  const orderbook = await readMarketOrderBook(supabase as never, "11111111-1111-1111-1111-111111111111");
  const trades = await readMarketTrades(supabase as never, "11111111-1111-1111-1111-111111111111");

  assert.equal(marketList.length, 1);
  assert.equal(typeof marketList[0]?.minPrice, "string");
  assert.equal(marketList[0]?.createdAt, "2025-12-31T00:00:00.000Z");

  assert.equal(marketDetail?.id, "11111111-1111-1111-1111-111111111111");
  assert.equal(typeof marketDetail?.tickSize, "string");

  assert.equal(orderbook.levels.length, 1);
  assert.equal(typeof orderbook.levels[0]?.priceTicks, "string");
  assert.equal(typeof orderbook.levels[0]?.quantityAtoms, "string");

  assert.equal(trades.trades.length, 1);
  assert.equal(typeof trades.trades[0]?.id, "string");
  assert.equal(trades.trades[0]?.executedAt, "2026-01-02T00:00:00.000Z");

  assert.doesNotThrow(() => JSON.stringify({ marketList, marketDetail, orderbook, trades }));
});
