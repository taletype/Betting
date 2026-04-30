import assert from "node:assert/strict";
import test from "node:test";

import { previewPolymarketOrder } from "./polymarket-orders";
import type { ExternalMarketApiRecord } from "../../../lib/api";

const VALID_BUILDER_CODE = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";

const market: ExternalMarketApiRecord = {
  id: "m1",
  source: "polymarket",
  externalId: "condition-1",
  slug: "poly-preview",
  title: "Will preview stay safe?",
  description: "Preview test",
  status: "open",
  marketUrl: "https://polymarket.com/event/poly-preview",
  imageUrl: null,
  iconUrl: null,
  imageSourceUrl: null,
  imageUpdatedAt: null,
  closeTime: "2026-05-02T00:00:00.000Z",
  endTime: null,
  resolvedAt: null,
  bestBid: 0.5,
  bestAsk: 0.52,
  lastTradePrice: 0.51,
  volume24h: 10,
  volumeTotal: 100,
  lastSyncedAt: "2026-05-01T00:00:00.000Z",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  outcomes: [{ externalOutcomeId: "token-yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.5, bestAsk: 0.52, lastPrice: 0.51, volume: null }],
  recentTrades: [],
};

const withEnv = async (values: Record<string, string | undefined>, run: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const baseInput = () => ({
  marketSource: "polymarket",
  marketExternalId: "condition-1",
  outcomeExternalId: "token-yes",
  tokenId: "token-yes",
  side: "BUY",
  price: 0.55,
  size: 10,
  orderType: "GTC",
  orderStyle: "limit",
  loggedIn: true,
  walletConnected: true,
  geoblockAllowed: true,
  l2CredentialsPresent: true,
  userSigningAvailable: true,
  submitterAvailable: true,
});

test("order preview validates side, price, size, and token id", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ tick_size: "0.01", min_order_size: "5", bids: [], asks: [] }))) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    const invalid = await previewPolymarketOrder(
      { ...baseInput(), side: "HOLD", price: 0.555, size: 1, tokenId: "wrong-token" },
      [market],
      new Date("2026-05-01T00:00:00.000Z"),
    );

    assert.equal(invalid.ok, false);
    assert.ok(invalid.disabledReasonCodes.includes("invalid_order"));
    assert.match(invalid.disabledReasons.join(" "), /價格或數量無效/);
  });
});

test("marketable order preview uses worst acceptable price as slippage protection", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ tick_size: "0.01", min_order_size: "5", bids: [], asks: [] }))) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    const preview = await previewPolymarketOrder(
      { ...baseInput(), orderType: "FOK", orderStyle: "marketable_limit", amount: 20, size: undefined, slippageBps: 200 },
      [market],
      new Date("2026-05-01T00:00:00.000Z"),
    );

    assert.equal(preview.ok, true);
    assert.equal(preview.order.orderStyle, "marketable_limit");
    assert.equal(preview.order.worstAcceptablePrice, 0.561);
    assert.equal(preview.order.notional, 11);
  });
});

test("preview returns exact disabled reasons for missing wallet, credentials, and feature flag without region gate", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ tick_size: "0.01", min_order_size: "5", bids: [], asks: [] }))) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ POLY_BUILDER_CODE: undefined, POLYMARKET_ROUTED_TRADING_ENABLED: undefined }, async () => {
    const preview = await previewPolymarketOrder(
      { ...baseInput(), walletConnected: false, geoblockAllowed: false, l2CredentialsPresent: false },
      [market],
      new Date("2026-05-01T00:00:00.000Z"),
    );

    assert.deepEqual(
      preview.disabledReasons.filter((reason) =>
        ["尚未連接錢包", "設定 Polymarket 憑證", "Builder Code 未設定", "交易功能尚未啟用"].includes(reason),
      ),
      ["交易功能尚未啟用", "尚未連接錢包", "設定 Polymarket 憑證", "Builder Code 未設定"],
    );
    assert.doesNotMatch(preview.disabledReasonCodes.join(" "), /geo|region/);
  });
});

test("preview cannot become live-submittable by default", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ tick_size: "0.01", min_order_size: "5", bids: [], asks: [] }))) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: undefined }, async () => {
    const preview = await previewPolymarketOrder(
      baseInput(),
      [market],
      new Date("2026-05-01T00:00:00.000Z"),
    );

    assert.equal(preview.ok, false);
    assert.equal(preview.routedTradingEnabled, false);
    assert.equal(preview.disabledReasonCodes[0], "feature_disabled");
    assert.match(preview.disabledReasons[0] ?? "", /交易功能尚未啟用/);
  });
});
