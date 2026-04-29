import assert from "node:assert/strict";
import test from "node:test";

import { getAmbassadorDashboard, listExternalMarkets, listMarkets } from "./api";

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

test("listExternalMarkets surfaces network error when configured API base is unreachable", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: FetchCall[] = [];

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = (async (...args: FetchCall) => {
    calls.push(args);
    throw new Error("connect ECONNREFUSED api.example.com:443");
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

  await assert.rejects(() => listExternalMarkets(), /ECONNREFUSED/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "https://api.example.com/external/markets");
});

test("listExternalMarkets fails fast in production when API_BASE_URL is not configured", async (t) => {
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  t.after(() => {
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
    await assert.rejects(() => listExternalMarkets(), /Missing API base URL/);
  });
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
