import assert from "node:assert/strict";
import test from "node:test";

import {
  ExternalMarketsLoadError,
  getAmbassadorDashboard,
  getExternalMarket,
  getExternalMarketHistory,
  getExternalMarketOrderbook,
  getExternalMarketStats,
  getExternalMarketTrades,
  listExternalMarkets,
  listMarkets,
} from "./api";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

const withNodeEnv = (value: string | undefined, run: () => Promise<void> | void): Promise<void> | void => {
  const originalEnv = process.env;
  process.env = { ...originalEnv };

  const mutableEnv = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = value;
  }

  try {
    return run();
  } finally {
    process.env = originalEnv;
  }
};

const createFetchMock = (payload: unknown, calls: FetchCall[]): typeof globalThis.fetch =>
  (async (...args: FetchCall) => {
    calls.push(args);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

test("listMarkets uses local Next API route when API base is not configured", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: FetchCall[] = [];

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = createFetchMock([], calls);

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await listMarkets();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "http://127.0.0.1:3000/api/markets");
});

test("listMarkets uses configured absolute API base URL without trailing slash", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: FetchCall[] = [];

  process.env.API_BASE_URL = "https://api.example.com///";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = createFetchMock([], calls);

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await listMarkets();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "https://api.example.com/markets");
});


test("listExternalMarkets returns empty array for non-array payload", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ market: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  const markets = await listExternalMarkets();
  assert.deepEqual(markets, []);
});

test("listExternalMarkets uses local Next API route when API base is not configured", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: FetchCall[] = [];

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = createFetchMock([], calls);

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await listExternalMarkets();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "http://127.0.0.1:3000/api/external/markets");
});

test("public external market detail helpers use same-site Next API route when API base is not configured", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: string[] = [];

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/orderbook")) {
      return new Response(JSON.stringify({ orderbook: [], depth: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/trades")) {
      return new Response(JSON.stringify({ trades: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/history")) {
      return new Response(JSON.stringify({ history: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/stats")) {
      return new Response(JSON.stringify({ source: "polymarket", externalId: "poly-1", volume24h: null, liquidity: null, spread: null, closeTime: null, lastUpdatedAt: null, stale: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ market: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await getExternalMarket("polymarket", "poly-1");
  await getExternalMarketOrderbook("polymarket", "poly-1");
  await getExternalMarketTrades("polymarket", "poly-1");
  await getExternalMarketHistory("polymarket", "poly-1");
  await getExternalMarketStats("polymarket", "poly-1");

  assert.deepEqual(calls, [
    "http://127.0.0.1:3000/api/external/markets/polymarket/poly-1",
    "http://127.0.0.1:3000/api/external/markets/polymarket/poly-1/orderbook",
    "http://127.0.0.1:3000/api/external/markets/polymarket/poly-1/trades",
    "http://127.0.0.1:3000/api/external/markets/polymarket/poly-1/history",
    "http://127.0.0.1:3000/api/external/markets/polymarket/poly-1/stats",
  ]);
});

test("listExternalMarkets uses standalone API route when API base is configured", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: FetchCall[] = [];

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = createFetchMock([], calls);

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await listExternalMarkets();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "https://api.example.com/external/markets");
});

test("listExternalMarkets falls back to same-site route when configured API base is unreachable", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const calls: FetchCall[] = [];

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.VERCEL_URL = "bet.example.vercel.app";

  globalThis.fetch = (async (...args: FetchCall) => {
    calls.push(args);
    if (String(args[0]) === "https://api.example.com/external/markets") {
      throw new Error("connect ECONNREFUSED api.example.com:443");
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
  });

  const markets = await listExternalMarkets();

  assert.deepEqual(markets, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.[0], "https://api.example.com/external/markets");
  assert.equal(calls[1]?.[0], "https://bet.example.vercel.app/api/external/markets");
});

test("listExternalMarkets uses same-site Next API route in production when API_BASE_URL is not configured", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const calls: FetchCall[] = [];

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.VERCEL_URL = "bet.example.vercel.app";
  globalThis.fetch = createFetchMock([], calls);

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
  });

  await withNodeEnv("production", async () => {
    const markets = await listExternalMarkets();
    assert.deepEqual(markets, []);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "https://bet.example.vercel.app/api/external/markets");
});

test("listExternalMarkets returns safe diagnostic for localhost API base in production", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalWarn = console.warn;
  const calls: FetchCall[] = [];
  const warnings: string[] = [];

  process.env.API_BASE_URL = "http://localhost:4000";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.fetch = (async (...args: FetchCall) => {
    calls.push(args);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await withNodeEnv("production", async () => {
    await assert.rejects(
      () => listExternalMarkets(),
      (error: unknown) =>
        error instanceof ExternalMarketsLoadError &&
        error.diagnostics.includes("configured_api_base_unreachable") &&
        !error.message.includes("localhost"),
    );
  });

  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0] ?? "", /localhost:4000/);
});

test("listExternalMarkets classifies backend 500 and Supabase env errors", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Supabase environment variables are missing or invalid", code: "SUPABASE_ENV_MISSING" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await assert.rejects(
    () => listExternalMarkets(),
    (error: unknown) =>
      error instanceof ExternalMarketsLoadError &&
      error.diagnostics.includes("backend_500") &&
      error.diagnostics.includes("supabase_env_missing"),
  );
});

test("listExternalMarkets classifies missing /external/markets route", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Endpoint not implemented" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await assert.rejects(
    () => listExternalMarkets(),
    (error: unknown) =>
      error instanceof ExternalMarketsLoadError &&
      error.diagnostics.includes("external_markets_not_implemented"),
  );
});

test("getAmbassadorDashboard uses local Next API route when API base is not configured", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: FetchCall[] = [];

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = createFetchMock(
    {
      ambassadorCode: {
        id: "11111111-1111-4111-8111-111111111111",
        code: "DEMO1001",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        status: "active",
        inviteUrl: "http://127.0.0.1:3000/ambassador?ref=DEMO1001",
        createdAt: "2026-04-22T00:00:00.000Z",
        disabledAt: null,
      },
      attribution: null,
      directReferrals: [],
      rewards: {
        pendingRewards: "0",
        payableRewards: "0",
        approvedRewards: "0",
        paidRewards: "0",
        voidRewards: "0",
        directReferralCount: 0,
        directTradingVolumeUsdcAtoms: "0",
      },
      rewardLedger: [],
      payouts: [],
    },
    calls,
  );

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  await getAmbassadorDashboard();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "http://127.0.0.1:3000/api/ambassador/dashboard");
});
