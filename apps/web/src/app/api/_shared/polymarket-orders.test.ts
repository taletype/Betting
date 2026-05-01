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
  sourceProvenance: {
    statusFlags: { active: true, closed: false, acceptingOrders: true, enableOrderBook: true },
    stale: false,
    staleAfter: "2099-05-01T00:00:00.000Z",
  },
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

test("market state labels never mask missing credentials or disabled submitter as closed", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ tick_size: "0.01", min_order_size: "5", bids: [], asks: [] }))) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: undefined }, async () => {
    const missingCredentials = await previewPolymarketOrder(
      { ...baseInput(), l2CredentialsPresent: false },
      [market],
      new Date("2026-05-01T00:00:00.000Z"),
    );
    assert.match(missingCredentials.disabledReasons.join(" "), /設定 Polymarket 交易權限/);
    assert.doesNotMatch(missingCredentials.disabledReasons.join(" "), /市場已關閉/);

    const disabledFeature = await previewPolymarketOrder(
      baseInput(),
      [market],
      new Date("2026-05-01T00:00:00.000Z"),
    );
    assert.match(disabledFeature.disabledReasons.join(" "), /實盤提交已停用/);
    assert.doesNotMatch(disabledFeature.disabledReasons.join(" "), /市場已關閉/);

    const disabledSubmitter = await previewPolymarketOrder(
      { ...baseInput(), submitterAvailable: false },
      [market],
      new Date("2026-05-01T00:00:00.000Z"),
    );
    assert.match(disabledSubmitter.disabledReasons.join(" "), /實盤提交已停用/);
    assert.doesNotMatch(disabledSubmitter.disabledReasons.join(" "), /市場已關閉/);
  });
});

test("order preview exposes precise Polymarket market tradability labels", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ tick_size: "0.01", min_order_size: "5", bids: [], asks: [] }))) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    const cases: Array<[string, Partial<ExternalMarketApiRecord>, string]> = [
      ["closed", { status: "closed", sourceProvenance: { statusFlags: { closed: true } } }, "市場已關閉"],
      ["resolved", { status: "resolved", resolvedAt: "2026-05-01T00:00:00.000Z" }, "市場已結算"],
      ["cancelled", { status: "cancelled", sourceProvenance: { statusFlags: { cancelled: true } } }, "市場已取消"],
      ["not-accepting", { sourceProvenance: { statusFlags: { active: true, closed: false, acceptingOrders: false } } }, "市場暫不接受訂單"],
      ["orderbook-disabled", { sourceProvenance: { statusFlags: { active: true, closed: false, enableOrderBook: false } } }, "訂單簿暫不可用"],
    ];

    for (const [id, overrides, label] of cases) {
      const preview = await previewPolymarketOrder(
        baseInput(),
        [{ ...market, id, externalId: "condition-1", ...overrides }],
        new Date("2026-05-01T00:00:00.000Z"),
      );
      assert.equal(preview.market?.tradable, false);
      assert.match(preview.disabledReasons.join(" "), new RegExp(label));
      assert.equal(preview.market?.tradabilityLabel, label);
    }

    const pastButAccepting = await previewPolymarketOrder(
      baseInput(),
      [{
        ...market,
        closeTime: "2026-04-01T00:00:00.000Z",
        endTime: "2026-04-01T00:00:00.000Z",
        sourceProvenance: { statusFlags: { active: true, closed: false, acceptingOrders: true } },
      }],
      new Date("2026-05-01T00:00:00.000Z"),
    );
    assert.equal(pastButAccepting.market?.tradable, true);
    assert.equal(pastButAccepting.market?.tradabilityCode, "tradable");
    assert.equal(pastButAccepting.disabledReasonCodes.includes("market_not_tradable"), false);
  });
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
        ["連接錢包", "設定 Polymarket 交易權限", "Builder Code 未設定", "實盤提交已停用"].includes(reason),
      ),
      ["連接錢包", "設定 Polymarket 交易權限", "Builder Code 未設定", "實盤提交已停用"],
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
    assert.match(preview.disabledReasons[0] ?? "", /實盤提交已停用/);
  });
});
