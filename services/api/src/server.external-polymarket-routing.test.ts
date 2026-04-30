import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  evaluateExternalPolymarketOrderReadiness,
  routeExternalPolymarketOrder,
  type ExternalPolymarketOrderRouteInput,
  type ExternalPolymarketOrderRoutePayload,
  type PolymarketOrderSubmitter,
} from "./modules/external-polymarket-routing/handlers";
import { setExternalMarketsRepositoryForTests, type ExternalMarketView } from "./modules/external-markets/repository";

process.env.NODE_ENV = "test";

const VALID_BUILDER_CODE = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER_WALLET = "0x1111111111111111111111111111111111111111";
const TOKEN_ID = "123";
const NOW = new Date("2026-05-01T00:00:00.000Z");

const getHandleRequest = async () => (await import("./server")).handleRequest;
const getServer = async () => await import("./server");

const withRouteAuth = async (run: (handleRequest: (request: Request) => Promise<Response>) => Promise<void>) => {
  const server = await getServer();
  server.setApiAuthVerifierForTests(async () => ({
    id: USER_ID,
    email: "user@example.test",
    role: "user",
    claims: {},
  }));
  try {
    await run(server.handleRequest);
  } finally {
    server.setApiAuthVerifierForTests(null);
  }
};

const withEnv = async (values: Record<string, string | undefined>, run: () => Promise<void>) => {
  const prev = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(values)) {
    prev.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await run();
  } finally {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const marketRecord = (overrides: Partial<ExternalMarketView> = {}): ExternalMarketView => ({
  ...baseMarket(),
  ...overrides,
});

const baseMarket = (): ExternalMarketView => ({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  source: "polymarket" as const,
  externalId: "condition-1",
  slug: "poly-1",
  title: "Will routed trading stay safe?",
  description: "Builder route test",
  status: "open" as const,
  marketUrl: "https://polymarket.com/event/poly-1",
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
  outcomes: [{ externalOutcomeId: TOKEN_ID, title: "Yes", slug: "yes", index: 0, yesNo: "yes" as const, bestBid: 0.5, bestAsk: 0.52, lastPrice: 0.51, volume: 10 }],
  recentTrades: [],
  latestOrderbook: [],
});

const withMarket = async (market: ExternalMarketView, run: () => Promise<void>) => {
  setExternalMarketsRepositoryForTests({
    listExternalMarketRecords: async () => [market],
    getExternalMarketRecord: async (source, externalId) =>
      source === market.source && externalId === market.externalId ? market : null,
    listExternalMarketTrades: async () => [],
  });
  try {
    await run();
  } finally {
    setExternalMarketsRepositoryForTests(null);
  }
};

const baseInput = (overrides: Partial<ExternalPolymarketOrderRouteInput> = {}): ExternalPolymarketOrderRouteInput => ({
  userWalletAddress: USER_WALLET,
  marketSource: "polymarket",
  marketExternalId: "condition-1",
  outcomeExternalId: TOKEN_ID,
  orderType: "GTC",
  orderInput: {
    tokenID: TOKEN_ID,
    side: "BUY",
    price: 0.55,
    size: 10,
    expiration: 0,
    builderCode: VALID_BUILDER_CODE,
  },
  signedOrder: {
    salt: "1",
    maker: USER_WALLET,
    signer: USER_WALLET,
    tokenId: TOKEN_ID,
    makerAmount: "5500000",
    takerAmount: "10000000",
    side: "BUY",
    signatureType: 0,
    timestamp: String(NOW.getTime()),
    expiration: "0",
    metadata: "0x0000000000000000000000000000000000000000000000000000000000000000",
    builder: VALID_BUILDER_CODE,
    signature: "0xsafesignature",
  },
  userConfirmation: {
    side: "BUY",
    tokenID: TOKEN_ID,
    outcomeExternalId: TOKEN_ID,
    price: 0.55,
    size: 10,
    orderType: "GTC",
    expiration: 0,
    builderCode: VALID_BUILDER_CODE,
    builderFeeAcknowledged: true,
    confirmedAt: NOW.toISOString(),
  },
  geoblock: {
    blocked: false,
    checkedAt: NOW.toISOString(),
    country: "HK",
    region: null,
  },
  ...overrides,
});

const liveDeps = (submitter: PolymarketOrderSubmitter) => ({
  requestUserId: USER_ID,
  submitter,
  linkedWalletLookup: async () => ({ walletAddress: USER_WALLET }),
  l2CredentialLookup: async () => ({ status: "present" as const, credentials: { key: "user-key", secret: "dXNlci1zZWNyZXQ=", passphrase: "user-passphrase" } }),
  signatureVerifier: async () => true,
  geoblockProofVerifier: async () => true,
  auditRecorder: async () => {},
  now: () => NOW,
  allowNonProductionSubmissionForTests: true,
});

const mockSubmitter = (onSubmit?: (payload: ExternalPolymarketOrderRoutePayload) => void): PolymarketOrderSubmitter => ({
  mode: "real",
  healthCheck: async () => ({ ok: true }),
  getMarketConstraints: async (conditionId, tokenId) => ({ conditionId, tokenId, tickSize: "0.01", negRisk: false, minOrderSize: "5" }),
  submitOrder: async (payload) => {
    onSubmit?.(payload);
    return { success: true, orderId: "order-1", status: "submitted", error: null, transactionHashes: [], takingAmount: "10", makingAmount: "5.5" };
  },
});

test("missing builder code disables routed trading but read-only external markets still work", async (t) => {
  const handleRequest = await getHandleRequest();
  setExternalMarketsRepositoryForTests({ listExternalMarketRecords: async () => [baseMarket()], getExternalMarketRecord: async () => null, listExternalMarketTrades: async () => [] });
  t.after(() => setExternalMarketsRepositoryForTests(null));
  await withEnv({ POLY_BUILDER_CODE: undefined, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    const readOnlyResponse = await handleRequest(new Request("http://localhost/external/markets"));
    assert.equal(readOnlyResponse.status, 200);
    const unauthenticatedResponse = await handleRequest(new Request("http://localhost/external/polymarket/orders/route", { method: "POST", body: JSON.stringify({ orderInput: { tokenID: "123" } }) }));
    assert.equal(unauthenticatedResponse.status, 401);
    await withRouteAuth(async (authenticatedHandleRequest) => {
      const routingResponse = await authenticatedHandleRequest(new Request("http://localhost/external/polymarket/orders/route", { method: "POST", body: JSON.stringify({ orderInput: { tokenID: "123" } }) }));
      const payload = await routingResponse.json() as { code: string };
      assert.equal(routingResponse.status, 503);
      assert.equal(payload.code, "POLYMARKET_BUILDER_CODE_MISSING");
    });
  });
});

test("external Polymarket routing stays disabled behind the named feature flag", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: undefined }, async () => {
    await withRouteAuth(async (handleRequest) => {
      const response = await handleRequest(new Request("http://localhost/external/polymarket/orders/route", { method: "POST", body: JSON.stringify(baseInput()) }));
      const payload = await response.json() as { code: string };
      assert.equal(response.status, 503);
      assert.equal(payload.code, "POLYMARKET_ROUTED_TRADING_DISABLED");
    });
  });
});

test("setting routed trading true without real submitter still fails", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true", APP_ENV: "staging", POLYMARKET_CLOB_SUBMITTER: "disabled" }, async () => {
    await withRouteAuth(async (handleRequest) => {
      const response = await handleRequest(new Request("http://localhost/external/polymarket/orders/route", { method: "POST", body: JSON.stringify(baseInput()) }));
      const payload = await response.json() as { code: string };
      assert.equal(response.status, 503);
      assert.equal(payload.code, "POLYMARKET_SUBMITTER_UNAVAILABLE");
    });
  });
});

test("beta routed trading flag is not enough without allowlist", async () => {
  await withEnv({
    POLY_BUILDER_CODE: VALID_BUILDER_CODE,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: undefined,
    POLYMARKET_CLOB_SUBMITTER: "real",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      const preflight = await evaluateExternalPolymarketOrderReadiness(baseInput({ signedOrder: undefined }), {
        ...liveDeps(mockSubmitter()),
        allowNonProductionSubmissionForTests: false,
        serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
        balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
      });
      assert.equal(preflight.state, "beta_user_not_allowlisted");
      assert.ok(preflight.disabledReasons.includes("beta_user_not_allowlisted"));
      assert.equal(preflight.readiness.disabledReason, "測試交易功能只限指定用戶");
    });
  });
});

test("allowlist alone is not enough without beta flag", async () => {
  await withEnv({
    POLY_BUILDER_CODE: VALID_BUILDER_CODE,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: `  ${USER_ID} ,, `,
    POLYMARKET_CLOB_SUBMITTER: "real",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      const preflight = await evaluateExternalPolymarketOrderReadiness(baseInput({ signedOrder: undefined }), {
        ...liveDeps(mockSubmitter()),
        allowNonProductionSubmissionForTests: false,
        serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
        balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
      });
      assert.equal(preflight.state, "routed_trading_disabled");
      assert.ok(preflight.disabledReasons.includes("routed_trading_disabled"));
      assert.equal(preflight.canaryAllowed, false);
    });
  });
});

test("allowlisted beta user cannot submit without builder code", async () => {
  await withEnv({
    APP_ENV: "staging",
    POLY_BUILDER_CODE: undefined,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: USER_ID,
    POLYMARKET_CLOB_SUBMITTER: "real",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), {
          ...liveDeps(mockSubmitter()),
          allowNonProductionSubmissionForTests: false,
          serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
          balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
        }),
        /POLY_BUILDER_CODE is required/,
      );
    });
  });
});

test("allowlisted beta user cannot submit without submitter", async () => {
  await withEnv({
    APP_ENV: "staging",
    POLY_BUILDER_CODE: VALID_BUILDER_CODE,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: USER_ID,
    POLYMARKET_CLOB_SUBMITTER: "disabled",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), {
          ...liveDeps({
            ...mockSubmitter(),
            mode: "disabled",
            healthCheck: async () => ({ ok: false, reason: "disabled" }),
          } satisfies PolymarketOrderSubmitter),
          allowNonProductionSubmissionForTests: false,
          serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
          balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
        }),
        /submitter unavailable/i,
      );
    });
  });
});

test("invalid builder code disables submit safely", async () => {
  await withEnv({
    APP_ENV: "staging",
    POLY_BUILDER_CODE: "0x1234",
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: USER_ID,
    POLYMARKET_CLOB_SUBMITTER: "real",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      const preflight = await evaluateExternalPolymarketOrderReadiness(baseInput({ signedOrder: undefined }), {
        ...liveDeps(mockSubmitter()),
        allowNonProductionSubmissionForTests: false,
        serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
        balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
      });
      assert.equal(preflight.builderCodeConfigured, false);
      assert.ok(preflight.disabledReasons.includes("builder_code_missing"));
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), {
          ...liveDeps(mockSubmitter()),
          allowNonProductionSubmissionForTests: false,
          serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
          balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
        }),
        /POLY_BUILDER_CODE is required|bytes32 hex string/,
      );
    });
  });
});

test("allowlisted beta user reaches ready-for-signature only when all non-signature gates pass", async () => {
  await withEnv({
    POLY_BUILDER_CODE: VALID_BUILDER_CODE,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: USER_ID,
    POLYMARKET_CLOB_SUBMITTER: "real",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      const preflight = await evaluateExternalPolymarketOrderReadiness(baseInput({ signedOrder: undefined }), {
        ...liveDeps(mockSubmitter()),
        allowNonProductionSubmissionForTests: false,
        serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
        balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
      });
      assert.equal(preflight.state, "ready_for_user_signature");
      assert.equal(preflight.ok, true);
      assert.equal(preflight.readiness.safeToSubmit, false);
      assert.deepEqual(preflight.readiness.missingChecks, ["userCanSignOrder"]);
    });
  });
});

test("allowlisted beta user still cannot submit when any readiness check fails", async () => {
  await withEnv({
    POLY_BUILDER_CODE: VALID_BUILDER_CODE,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: USER_ID,
    POLYMARKET_CLOB_SUBMITTER: "real",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      const preflight = await evaluateExternalPolymarketOrderReadiness(baseInput(), {
        ...liveDeps(mockSubmitter()),
        allowNonProductionSubmissionForTests: false,
        serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
        balanceAllowanceLookup: async () => ({ balanceSufficient: false, allowanceSufficient: true }),
      });
      assert.equal(preflight.readiness.safeToSubmit, false);
      assert.ok(preflight.readiness.missingChecks.includes("balanceAllowanceReady"));
      assert.equal(preflight.readiness.disabledReason, "餘額或授權不足");
    });
  });
});

test("non-allowlisted users cannot submit through beta gate", async () => {
  await withEnv({
    APP_ENV: "staging",
    POLY_BUILDER_CODE: VALID_BUILDER_CODE,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: "someone-else@example.test",
    POLYMARKET_CLOB_SUBMITTER: "real",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), {
          ...liveDeps(mockSubmitter()),
          allowNonProductionSubmissionForTests: false,
          serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
          balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
        }),
        /指定用戶/,
      );
    });
  });
});

test("submit path blocks when attribution recording is disabled", async () => {
  await withEnv({
    APP_ENV: "staging",
    POLY_BUILDER_CODE: VALID_BUILDER_CODE,
    POLYMARKET_ROUTED_TRADING_ENABLED: "false",
    POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true",
    POLYMARKET_ROUTED_TRADING_ALLOWLIST: USER_ID,
    POLYMARKET_CLOB_SUBMITTER: "real",
    POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED: "true",
  }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), {
          ...liveDeps(mockSubmitter()),
          allowNonProductionSubmissionForTests: false,
          serverRegionCheck: { status: "allowed", country: "HK", region: null, checkedAt: NOW.toISOString() },
          balanceAllowanceLookup: async () => ({ balanceSufficient: true, allowanceSufficient: true }),
        }),
        /attribution recording is not ready/,
      );
    });
  });
});

test("restricted and unknown server regions block preflight", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true", POLYMARKET_ROUTED_TRADING_CANARY_USER_IDS: USER_ID, POLYMARKET_CLOB_SUBMITTER: "real" }, async () => {
    await withMarket(baseMarket(), async () => {
      const restricted = await evaluateExternalPolymarketOrderReadiness(baseInput(), {
        ...liveDeps(mockSubmitter()),
        serverRegionCheck: { status: "blocked", country: "US", region: null, checkedAt: NOW.toISOString() },
      });
      assert.ok(restricted.disabledReasons.includes("region_blocked"));
      const unknown = await evaluateExternalPolymarketOrderReadiness(baseInput(), {
        ...liveDeps(mockSubmitter()),
        serverRegionCheck: { status: "unknown", country: null, region: null, checkedAt: NOW.toISOString() },
      });
      assert.ok(unknown.disabledReasons.includes("region_unknown"));
    });
  });
});

test("builderCode is attached only in the safe signed submit path and is preserved through submission", async () => {
  let submittedPayload: ExternalPolymarketOrderRoutePayload | null = null;
  let auditedPayload: ExternalPolymarketOrderRoutePayload | null = null;
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "false", POLYMARKET_ROUTED_TRADING_BETA_ENABLED: "true", POLYMARKET_ROUTED_TRADING_ALLOWLIST: USER_ID }, async () => {
    await withMarket(baseMarket(), async () => {
      const result = await routeExternalPolymarketOrder(baseInput(), {
        ...liveDeps(mockSubmitter((payload) => { submittedPayload = payload; })),
        auditRecorder: async (payload) => {
          auditedPayload = payload;
        },
      });
      assert.equal(result.status, "submitted");
      assert.equal(result.attribution.attachedBeforeUserSignature, true);
      assert.equal(submittedPayload?.orderInput.builderCode, VALID_BUILDER_CODE);
      assert.equal(submittedPayload?.signedOrder.builder, VALID_BUILDER_CODE);
      assert.equal(auditedPayload?.userId, USER_ID);
      assert.equal(auditedPayload?.market.externalId, "condition-1");
      assert.equal(auditedPayload?.userConfirmation.tokenID, TOKEN_ID);
    });
  });
});

test("geoblock proof is required before routed submission", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput({ geoblock: { blocked: true, checkedAt: NOW.toISOString(), country: "US" } }), liveDeps(mockSubmitter())),
        /current region/,
      );
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput({ geoblock: { blocked: false, checkedAt: new Date(NOW.getTime() - 120_000).toISOString(), country: "HK" } }), liveDeps(mockSubmitter())),
        /stale/,
      );
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), { ...liveDeps(mockSubmitter()), geoblockProofVerifier: undefined }),
        /geoblock proof could not be verified/,
      );
    });
  });
});

test("user signature verifier must exist and return true", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), { ...liveDeps(mockSubmitter()), signatureVerifier: undefined }),
        /order signature could not be verified/,
      );
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), { ...liveDeps(mockSubmitter()), signatureVerifier: async () => false }),
        /order signature could not be verified/,
      );
    });
  });
});

test("signed order signer must match linked user wallet", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), { ...liveDeps(mockSubmitter()), linkedWalletLookup: async () => ({ walletAddress: "0x2222222222222222222222222222222222222222" }) }),
        /signed order signer must match/,
      );
    });
  });
});

test("missing L2 credentials block submission", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput(), { ...liveDeps(mockSubmitter()), l2CredentialLookup: async () => ({ status: "missing" }) }),
        /Polymarket credentials required/,
      );
    });
  });
});

test("missing builder code in signed order blocks submission", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput({ signedOrder: { ...(baseInput().signedOrder as Record<string, unknown>), builder: "0x0000000000000000000000000000000000000000000000000000000000000000" } }), liveDeps(mockSubmitter())),
        /builderCode must be present before user signing/,
      );
    });
  });
});

test("stale or non-tradable market blocks submission", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await withMarket(marketRecord({ status: "closed" }), async () => {
      await assert.rejects(() => routeExternalPolymarketOrder(baseInput(), liveDeps(mockSubmitter())), /market is not open/);
    });
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput({ signedOrder: { ...(baseInput().signedOrder as Record<string, unknown>), timestamp: String(NOW.getTime() - 120_000) } }), liveDeps(mockSubmitter())),
        /signed order is stale/,
      );
    });
  });
});

test("invalid tokenId/outcome mapping blocks submission", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await withMarket(baseMarket(), async () => {
      await assert.rejects(
        () => routeExternalPolymarketOrder(baseInput({ outcomeExternalId: "not-the-token" }), liveDeps(mockSubmitter())),
        /tokenId does not belong/,
      );
    });
  });
});

test("external Polymarket routing modules do not import internal ledger or balance mutation paths", () => {
  for (const file of ["handlers.ts", "submitter.ts"]) {
    const source = readFileSync(resolve(process.cwd(), `src/modules/external-polymarket-routing/${file}`), "utf8");
    assert.doesNotMatch(source, /@bet\/ledger|@bet\/trading|ledger_journals|ledger_entries|balanceDeltas|rpc_place_order|public\.ledger/);
  }
});

test("external Polymarket routing logs do not include secrets or full signatures", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/handlers.ts"), "utf8");
  assert.doesNotMatch(source, /logger\.(error|info|warn)\([^)]*(signature|secret|passphrase|auth|signedOrder|l2Credentials)/is);
});

test("submitter uses only user-scoped L2 credentials from the route payload", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/submitter.ts"), "utf8");
  assert.match(source, /creds: toApiCreds\(payload\.l2Credentials\)/);
  assert.doesNotMatch(source, /process\.env\.POLYMARKET_(API_KEY|API_SECRET|API_PASSPHRASE|CLOB_API_KEY|CLOB_SECRET|CLOB_PASSPHRASE)/);
});

test("external Polymarket trading path does not mutate internal balances or log secrets", () => {
  const source = [
    readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/handlers.ts"), "utf8"),
    readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/submitter.ts"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /insert\s+into\s+public\.ledger|update\s+public\.portfolio|mutateBalance|creditBalance|debitBalance/i);
  assert.doesNotMatch(source, /logger\.(info|error|warn)\([^)]*(secret|passphrase|POLY_SIGNATURE|POLY_API_KEY|signature)/is);
});

test("failed routed submit does not create rewards", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/handlers.ts"), "utf8");

  assert.doesNotMatch(source, /ambassador_reward_ledger|markRewardsPayable|recordAdminMockBuilderTradeAttribution|requestAmbassadorPayout/i);
  assert.match(source, /routed_trade_submit_failed/);
});

test("payouts remain manual/admin-approved in ambassador repository", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/ambassador/repository.ts"), "utf8");
  assert.match(source, /payout requires admin approval before it can be marked paid/);
  assert.doesNotMatch(source, /AMBASSADOR_AUTO_PAYOUT_ENABLED=true/);
});
