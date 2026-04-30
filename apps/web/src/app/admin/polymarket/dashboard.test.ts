import assert from "node:assert/strict";
import test from "node:test";

import { getPolymarketOperationsDashboard } from "./dashboard";

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

test("Polymarket operations dashboard redacts backend failures and never exposes secrets", async () => {
  const dashboard = await getPolymarketOperationsDashboard({
    now: new Date("2026-04-30T12:00:00.000Z"),
    countBackendMarkets: async () => {
      const error = new Error("service-role credential secret, Polymarket API secret, and auth bearer token");
      error.name = "PGRST401";
      throw error;
    },
    readGammaFallbackMarkets: async () => [],
    fetchPublicPath: async (path) => ({
      status: path === "/api/external/markets" ? 503 : 200,
      json: { message: "private key secret" },
    }),
  });

  const serialized = JSON.stringify(dashboard);

  assert.equal(dashboard.marketDataHealth.backendReachable, false);
  assert.deepEqual(dashboard.marketDataHealth.lastError, { code: "PGRST401", source: "external_market_cache" });
  assert.doesNotMatch(serialized, /secret|Bearer|PRIVATE_KEY|SERVICE_ROLE|API_SECRET|Authorization/i);
});

test("Polymarket operations dashboard displays routed trading and auto payout disabled states", async () => {
  await withEnv({
    POLY_BUILDER_CODE: undefined,
    POLYMARKET_ROUTED_TRADING_ENABLED: undefined,
    POLYMARKET_CLOB_SUBMITTER: "disabled",
    AMBASSADOR_AUTO_PAYOUT_ENABLED: undefined,
  }, async () => {
    const dashboard = await getPolymarketOperationsDashboard({
      countBackendMarkets: async () => 0,
      readGammaFallbackMarkets: async () => [],
      fetchPublicPath: async () => ({ status: 200, json: [] }),
    });

    assert.equal(dashboard.readiness.routedTradingEnabled, false);
    assert.equal(dashboard.readiness.publicRoutedTradingEnabled, false);
    assert.equal(dashboard.readiness.betaRoutedTradingEnabled, false);
    assert.equal(dashboard.readiness.clobSubmitterMode, "disabled");
    assert.equal(dashboard.readiness.submitterReady, false);
    assert.equal(dashboard.readiness.attributionRecordingReady, true);
    assert.equal(dashboard.readiness.preflightStatus, "blocked");
    assert.equal(dashboard.rewards.autoPayoutEnabled, false);
  });
});

test("Polymarket operations dashboard reports beta allowlist status without revealing values", async () => {
  await withEnv({
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: "  admin@example.test , 22222222-2222-4222-8222-222222222222 ,, ",
    POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED: "true",
  }, async () => {
    const dashboard = await getPolymarketOperationsDashboard({
      currentUser: { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test" },
      countBackendMarkets: async () => 0,
      readGammaFallbackMarkets: async () => [],
      fetchPublicPath: async () => ({ status: 200, json: [] }),
    });
    const serialized = JSON.stringify(dashboard);

    assert.equal(dashboard.readiness.publicRoutedTradingEnabled, false);
    assert.equal(dashboard.readiness.betaRoutedTradingEnabled, true);
    assert.equal(dashboard.readiness.currentUserAllowlisted, true);
    assert.equal(dashboard.readiness.allowedUsersCount, 2);
    assert.equal(dashboard.readiness.attributionRecordingReady, false);
    assert.doesNotMatch(serialized, /admin@example\.test|22222222-2222-4222-8222-222222222222/);
  });
});

test("Polymarket operations dashboard handles backend failure with Gamma fallback health", async () => {
  const dashboard = await getPolymarketOperationsDashboard({
    countBackendMarkets: async () => {
      throw Object.assign(new Error("database down"), { code: "DB_UNAVAILABLE" });
    },
    readGammaFallbackMarkets: async () => [{ id: "gamma-1" }, { id: "gamma-2" }],
    fetchPublicPath: async (path) => ({ status: 200, json: path === "/api/external/markets" ? [{ id: "m1" }] : null }),
  });

  assert.equal(dashboard.marketDataHealth.backendReachable, false);
  assert.equal(dashboard.marketDataHealth.backendMarketCount, null);
  assert.equal(dashboard.marketDataHealth.gammaFallbackReachable, true);
  assert.equal(dashboard.marketDataHealth.gammaFallbackMarketCount, 2);
  assert.equal(dashboard.marketDataHealth.lastError?.source, "external_market_cache");
  assert.equal(dashboard.publicPages.latestMarketCount, 1);
  assert.equal(dashboard.publicPages.diagnosis, "ok");
});

test("Polymarket operations dashboard reports safe empty public market diagnosis", async () => {
  const dashboard = await getPolymarketOperationsDashboard({
    countBackendMarkets: async () => 0,
    readGammaFallbackMarkets: async () => [],
    fetchPublicPath: async () => ({ status: 200, json: [] }),
  });

  assert.equal(dashboard.publicPages.polymarketStatus, 200);
  assert.equal(dashboard.publicPages.externalMarketsStatus, 200);
  assert.equal(dashboard.publicPages.latestMarketCount, 0);
  assert.equal(dashboard.publicPages.diagnosis, "safe_empty");
});
