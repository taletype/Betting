import assert from "node:assert/strict";
import test from "node:test";

import { listExternalMarkets, listMarkets } from "./api";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

const createFetchMock = (payload: unknown, calls: FetchCall[]): typeof globalThis.fetch =>
  (async (...args: FetchCall) => {
    calls.push(args);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

test("listMarkets uses relative /markets path when API base is not configured", async (t) => {
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
  assert.equal(calls[0]?.[0], "/markets");
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

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ market: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markets = await listExternalMarkets();
  assert.deepEqual(markets, []);
});
