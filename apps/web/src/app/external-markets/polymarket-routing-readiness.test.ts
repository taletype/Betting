import assert from "node:assert/strict";
import test from "node:test";

import { getPolymarketRoutingReadiness } from "./polymarket-routing-readiness";

test("readiness model enumerates disabled states", () => {
  assert.equal(getPolymarketRoutingReadiness({ loggedIn: false, hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "auth_required");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: false, featureEnabled: true, walletConnected: true, hasCredentials: true, marketTradable: true, submitterAvailable: true }), "builder_code_missing");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: false, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "feature_disabled");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: false, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "wallet_not_connected");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: false, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "geoblocked");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: false, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "credentials_missing");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: false, marketTradable: true, orderValid: true, submitterAvailable: true }), "signature_required");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: false, orderValid: true, submitterAvailable: true }), "market_not_tradable");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: false, submitterAvailable: true }), "invalid_order");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: false }), "submitter_unavailable");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true, userSigned: false }), "signature_required");
});

test("readiness returns ready when all conditions are met", () => {
  assert.equal(getPolymarketRoutingReadiness({ loggedIn: true, hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true, userSigned: true }), "ready_to_submit");
  assert.equal(getPolymarketRoutingReadiness({ loggedIn: true, hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true, userSigned: true, submitted: true }), "submitted");
});
