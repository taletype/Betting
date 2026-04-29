import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { GET, setSupabaseAdminClientFactoryForTests } from "./[...path]/route";

const makeExternalMarketsSupabase = () => ({
  from(table: string) {
    if (table === "external_markets") {
      return {
        select: () => ({
          order: () => ({
            order: () => ({
              limit: async () => ({
                data: [
                  {
                    id: "11111111-1111-4111-8111-111111111111",
                    source: "polymarket",
                    external_id: "POLY-ROUTE-1",
                    slug: "poly-route-1",
                    title: "Will the Next API proxy serve Polymarket markets?",
                    description: "Route test",
                    status: "open",
                    market_url: "https://polymarket.com/event/poly-route-1",
                    close_time: null,
                    end_time: null,
                    resolved_at: null,
                    best_bid: "0.41",
                    best_ask: "0.44",
                    last_trade_price: "0.43",
                    volume_24h: "500",
                    volume_total: "10000",
                    last_synced_at: "2026-05-01T01:00:00.000Z",
                    created_at: "2026-05-01T01:00:00.000Z",
                    updated_at: "2026-05-01T01:00:00.000Z",
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };
    }

    if (table === "external_outcomes") {
      return {
        select: () => ({
          in: () => ({
            order: async () => ({
              data: [
                {
                  external_market_id: "11111111-1111-4111-8111-111111111111",
                  external_outcome_id: "yes",
                  title: "Yes",
                  slug: "yes",
                  outcome_index: 0,
                  yes_no: "yes",
                  best_bid: "0.41",
                  best_ask: "0.44",
                  last_price: "0.43",
                  volume: "500",
                },
              ],
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "external_trade_ticks") {
      return {
        select: () => ({
          in: () => ({
            order: async () => ({
              data: [
                {
                  external_market_id: "11111111-1111-4111-8111-111111111111",
                  external_trade_id: "trade-1",
                  external_outcome_id: "yes",
                  side: "buy",
                  price: "0.43",
                  size: "10",
                  traded_at: "2026-05-01T01:02:00.000Z",
                },
              ],
              error: null,
            }),
          }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  },
});

test("GET /api/external/markets serves synced external market data", async (t) => {
  setSupabaseAdminClientFactoryForTests(() => makeExternalMarketsSupabase() as never);

  t.after(() => {
    setSupabaseAdminClientFactoryForTests(null);
  });

  const response = await GET(new NextRequest("http://localhost/api/external/markets"), {
    params: Promise.resolve({ path: ["external", "markets"] }),
  });
  const payload = (await response.json()) as Array<{
    externalId: string;
    source: string;
    outcomes: Array<{ title: string }>;
    recentTrades: Array<{ externalTradeId: string }>;
  }>;

  assert.equal(response.status, 200);
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.source, "polymarket");
  assert.equal(payload[0]?.externalId, "POLY-ROUTE-1");
  assert.equal(payload[0]?.outcomes[0]?.title, "Yes");
  assert.equal(payload[0]?.recentTrades[0]?.externalTradeId, "trade-1");
});
