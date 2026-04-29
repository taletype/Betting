import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  routeExternalPolymarketOrder,
  type ExternalPolymarketOrderRoutePayload,
} from "./modules/external-polymarket-routing/handlers";
import { setExternalMarketsRepositoryForTests } from "./modules/external-markets/repository";

process.env.NODE_ENV = "test";

const VALID_BUILDER_CODE = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";

const getHandleRequest = async () => (await import("./server")).handleRequest;

const withEnv = async (
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
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

test("missing builder code disables routed trading but read-only external markets still work", async (t) => {
  const handleRequest = await getHandleRequest();

  setExternalMarketsRepositoryForTests({
    listExternalMarketRecords: async () => [
      {
        id: "m1",
        source: "polymarket",
        externalId: "123",
        slug: "will-it-rain",
        title: "Will it rain?",
        description: "desc",
        status: "open",
        marketUrl: "https://polymarket.com/event/will-it-rain",
        closeTime: null,
        endTime: null,
        resolvedAt: null,
        bestBid: 0.42,
        bestAsk: 0.44,
        lastTradePrice: 0.43,
        volume24h: 100,
        volumeTotal: 1000,
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        outcomes: [],
        recentTrades: [],
        latestOrderbook: [],
      },
    ],
    getExternalMarketRecord: async () => null,
    listExternalMarketTrades: async () => null,
  });

  t.after(() => {
    setExternalMarketsRepositoryForTests(null);
  });

  await withEnv(
    {
      POLY_BUILDER_CODE: undefined,
      POLYMARKET_ROUTED_TRADING_ENABLED: "true",
    },
    async () => {
      const readOnlyResponse = await handleRequest(new Request("http://localhost/external/markets"));
      const readOnlyPayload = (await readOnlyResponse.json()) as Array<{ source: string }>;

      assert.equal(readOnlyResponse.status, 200);
      assert.equal(readOnlyPayload[0]?.source, "polymarket");

      const routingResponse = await handleRequest(
        new Request("http://localhost/external/polymarket/orders/route", {
          method: "POST",
          body: JSON.stringify({
            orderInput: {
              tokenID: "123",
              side: "BUY",
              price: 0.55,
              size: 10,
            },
          }),
        }),
      );
      const routingPayload = (await routingResponse.json()) as { code: string; error: string };

      assert.equal(routingResponse.status, 503);
      assert.equal(routingPayload.code, "POLYMARKET_BUILDER_CODE_MISSING");
      assert.match(routingPayload.error, /POLY_BUILDER_CODE/);
    },
  );
});

test("external Polymarket routing stays disabled behind the named feature flag", async () => {
  const handleRequest = await getHandleRequest();

  await withEnv(
    {
      POLY_BUILDER_CODE: VALID_BUILDER_CODE,
      POLYMARKET_ROUTED_TRADING_ENABLED: undefined,
    },
    async () => {
      const response = await handleRequest(
        new Request("http://localhost/external/polymarket/orders/route", {
          method: "POST",
          body: JSON.stringify({
            orderInput: {
              tokenID: "123",
              side: "BUY",
              price: 0.55,
              size: 10,
            },
          }),
        }),
      );
      const payload = (await response.json()) as { code: string };

      assert.equal(response.status, 503);
      assert.equal(payload.code, "POLYMARKET_ROUTED_TRADING_DISABLED");
    },
  );
});

test("external Polymarket routing attaches builderCode before submission", async () => {
  let submittedPayload: ExternalPolymarketOrderRoutePayload | null = null;

  await withEnv(
    {
      POLY_BUILDER_CODE: VALID_BUILDER_CODE,
      POLYMARKET_ROUTED_TRADING_ENABLED: "true",
    },
    async () => {
      const result = await routeExternalPolymarketOrder(
        {
          orderType: "GTC",
          orderInput: {
            tokenID: "123",
            side: "BUY",
            price: 0.55,
            size: 10,
          },
        },
        {
          submitOrder: async (payload) => {
            submittedPayload = payload;
            return { orderID: "poly-order-1" };
          },
        },
      );

      assert.equal(result.status, "submitted");
      assert.equal(result.attribution.builderCodeAttached, true);
      assert.equal(submittedPayload?.orderInput.builderCode, VALID_BUILDER_CODE);
      assert.equal(submittedPayload?.orderType, "GTC");
    },
  );
});

test("external Polymarket routing rejects signed-order forwarding until signing boundary is wired", async () => {
  const handleRequest = await getHandleRequest();

  await withEnv(
    {
      POLY_BUILDER_CODE: VALID_BUILDER_CODE,
      POLYMARKET_ROUTED_TRADING_ENABLED: "true",
    },
    async () => {
      const response = await handleRequest(
        new Request("http://localhost/external/polymarket/orders/route", {
          method: "POST",
          body: JSON.stringify({
            signedOrder: {
              tokenId: "123",
              signature: "0xabc",
            },
          }),
        }),
      );
      const payload = (await response.json()) as { code: string };

      assert.equal(response.status, 501);
      assert.equal(payload.code, "POLYMARKET_USER_SIGNING_NOT_WIRED");
    },
  );
});

test("external Polymarket routing module does not import internal ledger or balance mutation paths", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/modules/external-polymarket-routing/handlers.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /@bet\/ledger/);
  assert.doesNotMatch(source, /@bet\/trading/);
  assert.doesNotMatch(source, /ledger_journals|ledger_entries|rpc_place_order|balanceDeltas/);
});
