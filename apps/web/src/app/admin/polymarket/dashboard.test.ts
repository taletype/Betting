import assert from "node:assert/strict";
import test from "node:test";

import { getPolymarketOperationsDashboard } from "./dashboard";
import { getAdminPolymarketStatusPayload } from "../../api/_shared/admin-polymarket-status";

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

test("admin Polymarket status computes smart/all market counts and sanitizes sync diagnostics", async () => {
  const cacheRows = [
    { is_active: true, stale_after: "2099-01-01T00:00:00.000Z", resolution_status: "open", best_bid: 0.4, best_ask: 0.42, volume: 100, liquidity: 100, outcomes: [{ lastPrice: 0.41 }], last_synced_at: "2026-05-01T00:00:00.000Z" },
    { is_active: true, stale_after: "2099-01-01T00:00:00.000Z", resolution_status: "open", best_bid: null, best_ask: null, volume: 0, liquidity: 0, outcomes: [], last_synced_at: "2026-05-01T00:01:00.000Z" },
    { is_active: true, stale_after: "2000-01-01T00:00:00.000Z", resolution_status: "open", best_bid: 0.5, best_ask: 0.52, volume: 5, liquidity: 5, outcomes: [{ lastPrice: 0.51 }], last_synced_at: "2026-05-01T00:02:00.000Z" },
    { is_active: false, stale_after: "2099-01-01T00:00:00.000Z", resolution_status: "closed", best_bid: 0.1, best_ask: 0.2, volume: 1, liquidity: 1, outcomes: [{ lastPrice: 0.15 }], last_synced_at: "2026-05-01T00:03:00.000Z" },
    { is_active: false, stale_after: "2099-01-01T00:00:00.000Z", resolution_status: "resolved", best_bid: 0.1, best_ask: 0.2, volume: 1, liquidity: 1, outcomes: [{ lastPrice: 0.15 }], last_synced_at: "2026-05-01T00:04:00.000Z" },
    { is_active: false, stale_after: "2099-01-01T00:00:00.000Z", resolution_status: "cancelled", best_bid: 0.1, best_ask: 0.2, volume: 1, liquidity: 1, outcomes: [{ lastPrice: 0.15 }], last_synced_at: "2026-05-01T00:05:00.000Z" },
  ];
  const recentRuns = [{
    sync_kind: "market_list_all_open",
    status: "success",
    started_at: "2026-05-01T00:10:00.000Z",
    finished_at: "2026-05-01T00:11:00.000Z",
    markets_seen: 5000,
    markets_upserted: 5000,
    error_message: null,
    diagnostics: {
      syncMode: "all_open",
      pagesFetched: 50,
      maxPagesReached: true,
      maxMarketsReached: false,
      privateTradingEndpointsUsed: false,
      secret: "SERVICE_ROLE_SHOULD_NOT_LEAK",
    },
  }];

  const supabase = {
    from(table: string) {
      if (table === "external_market_cache") {
        return { select: () => ({ eq: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: cacheRows, error: null }) }) }) }) }) };
      }
      if (table === "external_market_sync_runs") {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: recentRuns, error: null }) }) }) }) };
      }
      if (table === "external_market_translations") {
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }
      if (table === "polymarket_builder_fee_reconciliation_runs") {
        return { select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "polymarket_builder_fee_imports") {
        return { select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const payload = await getAdminPolymarketStatusPayload((() => supabase) as never);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.marketCounts.total, 6);
  assert.equal(payload.marketCounts.smartEligible, 1);
  assert.equal(payload.marketCounts.open, 3);
  assert.equal(payload.marketCounts.closed, 1);
  assert.equal(payload.marketCounts.resolved, 1);
  assert.equal(payload.marketCounts.cancelled, 1);
  assert.equal(payload.marketCounts.stale, 1);
  assert.equal(payload.marketCounts.noPrice, 1);
  assert.equal(payload.marketCounts.lowVolume, 1);
  assert.equal(payload.syncSummary.pagesFetchedLastFullSync, 50);
  assert.equal(payload.syncSummary.maxPagesReachedLastFullSync, true);
  assert.doesNotMatch(serialized, /SERVICE_ROLE_SHOULD_NOT_LEAK|secret/i);
  assert.equal(payload.recentRuns[0]?.diagnostics?.privateTradingEndpointsUsed, false);
});
