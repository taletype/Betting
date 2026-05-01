import assert from "node:assert/strict";
import test from "node:test";

import {
  getPolymarketReadinessChecklist,
  getPolymarketRoutingDisabledReasons,
  getPolymarketRoutingReadiness,
  getPolymarketTopBlockingReason,
  getPolymarketTradingReadiness,
  type PolymarketRoutingReadinessInput,
} from "./polymarket-routing-readiness";

const readyInput = (): PolymarketRoutingReadinessInput => ({
  loggedIn: true,
  hasBuilderCode: true,
  featureEnabled: true,
  walletConnected: true,
  geoblockAllowed: true,
  hasCredentials: true,
  userSigningAvailable: true,
  marketTradable: true,
  orderValid: true,
  submitModeEnabled: true,
  submitterAvailable: true,
  submitterEndpointAvailable: true,
  userSigned: true,
});

test("readiness model enumerates disabled states", () => {
  assert.equal(getPolymarketRoutingReadiness({ loggedIn: false, hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "signature_required");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: false, featureEnabled: true, walletConnected: true, hasCredentials: true, marketTradable: true, submitterAvailable: true }), "builder_code_missing");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: false, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "feature_disabled");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, betaUserAllowlisted: false, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "beta_user_not_allowlisted");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: false, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "wallet_not_connected");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: false, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "signature_required");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: false, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true }), "credentials_missing");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: false, marketTradable: true, orderValid: true, submitterAvailable: true }), "signature_required");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: false, orderValid: true, submitterAvailable: true }), "market_not_tradable");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: false, submitterAvailable: true }), "invalid_order");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: false }), "submitter_unavailable");
  assert.equal(getPolymarketRoutingReadiness({ hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true, userSigned: false }), "signature_required");
});

test("single trading readiness object exposes zh-HK reason, missing checks, and safe submit flag", () => {
  const blocked = getPolymarketTradingReadiness({
    ...readyInput(),
    betaUserAllowlisted: false,
    userSigned: true,
  });
  assert.equal(blocked.enabled, false);
  assert.equal(blocked.safeToSubmit, false);
  assert.equal(blocked.disabledReason, "測試交易功能只限指定用戶");
  assert.deepEqual(blocked.missingChecks, ["betaUserAllowlisted"]);

  const ready = getPolymarketTradingReadiness({ ...readyInput(), betaUserAllowlisted: true });
  assert.equal(ready.enabled, true);
  assert.equal(ready.safeToSubmit, true);
  assert.equal(ready.disabledReason, "透過 Polymarket 交易");
  assert.deepEqual(ready.missingChecks, []);
});

test("readiness returns ready when all conditions are met", () => {
  assert.equal(getPolymarketRoutingReadiness({ loggedIn: true, hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true, userSigned: true }), "ready_to_submit");
  assert.equal(getPolymarketRoutingReadiness({ loggedIn: true, hasBuilderCode: true, featureEnabled: true, walletConnected: true, geoblockAllowed: true, hasCredentials: true, userSigningAvailable: true, marketTradable: true, orderValid: true, submitterAvailable: true, userSigned: true, submitted: true }), "submitted");
});

test("wallet trade intent is the top public launch blocker while other checklist items remain visible", () => {
  const input = {
    ...readyInput(),
    featureEnabled: false,
    walletConnected: false,
    hasCredentials: false,
    userSigningAvailable: false,
    userSigned: false,
  };

  assert.equal(getPolymarketRoutingReadiness(input), "wallet_not_connected");
  assert.equal(getPolymarketTopBlockingReason(input), "wallet_not_connected");
  assert.deepEqual(getPolymarketRoutingDisabledReasons(input).slice(0, 4), [
    "wallet_not_connected",
    "credentials_missing",
    "feature_disabled",
    "signature_required",
  ]);

  const checklist = getPolymarketReadinessChecklist(input);
  assert.deepEqual(checklist.map((item) => item.label), [
    "錢包",
    "錢包資金",
    "Polymarket 交易權限",
    "用戶自行簽署",
    "Builder Code",
    "交易介面",
    "交易狀態",
    "價格及數量",
    "實盤提交器",
  ]);
  assert.equal(checklist.find((item) => item.id === "wallet")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "funding")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "credentials")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "signature")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "trading_feature")?.status, "complete");
});

test("region support is informational only and never disables trade intent", () => {
  const input = { ...readyInput(), geoblockAllowed: false, geoblockStatus: "blocked" as const, userSigned: true };

  assert.equal(getPolymarketRoutingReadiness(input), "ready_to_submit");
  assert.equal(getPolymarketTopBlockingReason(input), null);
  assert.doesNotMatch(getPolymarketRoutingDisabledReasons(input).join(" "), /geo|region/);
  assert.equal(getPolymarketReadinessChecklist(input).some((item) => item.id === ("region" as string)), false);
});
