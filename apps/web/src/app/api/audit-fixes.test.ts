import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { DELETE as legacyOrderDELETE } from "./orders/[orderId]/route";
import { GET as legacyPortfolioGET } from "./portfolio/route";
import { GET as legacyWithdrawalsGET, POST as legacyWithdrawalsPOST } from "./withdrawals/route";
import { POST as legacyClaimsPOST } from "./claims/[marketId]/route";
import { POST as legacyDepositVerifyPOST } from "./deposits/verify/route";
import { POST as legacyOrdersPOST } from "./orders/route";
import { GET as candlesGET } from "./cron/candles/route";
import { verifyCronRequest } from "./cron/_lib/verify-cron-request";

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

const expectedLegacyPayload = {
  error: "legacy_route_quarantined",
  message: "This legacy custodial betting route is no longer available.",
};

test("verifyCronRequest fails closed when CRON_SECRET is missing or empty", async () => {
  await withEnv({ CRON_SECRET: undefined }, async () => {
    const response = verifyCronRequest(new Request("http://localhost/api/cron/candles"));
    assert.equal(response?.status, 500);
    const payload = await response?.json() as { code?: string };
    assert.equal(payload.code, "CRON_SECRET_MISSING");
  });

  await withEnv({ CRON_SECRET: "   " }, async () => {
    const response = verifyCronRequest(new Request("http://localhost/api/cron/candles"));
    assert.equal(response?.status, 500);
    const payload = await response?.json() as { code?: string };
    assert.equal(payload.code, "CRON_SECRET_MISSING");
  });
});

test("verifyCronRequest rejects wrong secrets and accepts header or bearer secrets", async () => {
  await withEnv({ CRON_SECRET: "right-secret" }, async () => {
    const wrong = verifyCronRequest(new Request("http://localhost/api/cron/candles", {
      headers: { "x-cron-secret": "wrong-secret" },
    }));
    assert.equal(wrong?.status, 401);

    const headerOk = verifyCronRequest(new Request("http://localhost/api/cron/candles", {
      headers: { "x-cron-secret": " right-secret " },
    }));
    assert.equal(headerOk, null);

    const bearerOk = verifyCronRequest(new Request("http://localhost/api/cron/candles", {
      headers: { authorization: "Bearer right-secret" },
    }));
    assert.equal(bearerOk, null);
  });
});

test("cron endpoints reject requests when CRON_SECRET is missing", async () => {
  await withEnv({ CRON_SECRET: undefined }, async () => {
    const response = await candlesGET(new Request("http://localhost/api/cron/candles"));
    const payload = await response.json() as { code?: string };
    assert.equal(response.status, 500);
    assert.equal(payload.code, "CRON_SECRET_MISSING");
  });
});

test("legacy custodial API routes return 410 before auth", async () => {
  const responses = [
    await legacyPortfolioGET(),
    await legacyWithdrawalsGET(),
    await legacyWithdrawalsPOST(),
    await legacyDepositVerifyPOST(),
    await legacyOrdersPOST(),
    await legacyOrderDELETE(new NextRequest("http://localhost/api/orders/order-1"), {
      params: Promise.resolve({ orderId: "order-1" }),
    }),
    await legacyClaimsPOST(new NextRequest("http://localhost/api/claims/market-1"), {
      params: Promise.resolve({ marketId: "market-1" }),
    }),
  ];

  for (const response of responses) {
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), expectedLegacyPayload);
  }
});
