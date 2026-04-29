import assert from "node:assert/strict";
import test from "node:test";

import { getPolymarketRoutingReadiness } from "./polymarket-routing-readiness";

test("readiness model enumerates disabled states", () => {
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: false, featureEnabled: true, walletConnected: true, hasCredentials: true, marketTradable: true }), "builder_code_missing");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: false, walletConnected: true, hasCredentials: true, marketTradable: true }), "feature_disabled");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: false, hasCredentials: true, marketTradable: true }), "wallet_not_connected");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, hasCredentials: false, marketTradable: true }), "credentials_missing");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, hasCredentials: true, marketTradable: false }), "market_not_tradable");
});

test("readiness returns ready when all conditions are met", () => {
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, hasCredentials: true, marketTradable: true }), "ready_to_route");
});
