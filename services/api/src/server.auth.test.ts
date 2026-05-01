import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

const getServer = async () => await import("./server");
const getHandleRequest = async () => (await getServer()).handleRequest;

test("production request rejects spoofed x-user-id impersonation", async () => {
  const handleRequest = await getHandleRequest();
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.NODE_ENV = "production";
  try {
    const response = await handleRequest(
      new Request("http://localhost/wallets/linked", {
        headers: {
          "x-user-id": "11111111-1111-1111-1111-111111111111",
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "authentication required" });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("legacy internal exchange routes are quarantined unless explicitly enabled", async () => {
  const server = await getServer();
  const previous = process.env.INTERNAL_EXCHANGE_ENABLED;
  delete process.env.INTERNAL_EXCHANGE_ENABLED;
  server.setApiAuthVerifierForTests(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "user@example.test",
    role: "user",
    claims: {},
  }));
  try {
    for (const [method, path] of [
      ["GET", "/markets"],
      ["GET", "/markets/market-1/orderbook"],
      ["POST", "/orders"],
      ["DELETE", "/orders/order-1"],
      ["GET", "/portfolio"],
      ["GET", "/claims"],
      ["GET", "/claims/market-1/state"],
      ["POST", "/claims/market-1"],
      ["GET", "/deposits"],
      ["POST", "/deposits/verify"],
      ["GET", "/withdrawals"],
      ["POST", "/withdrawals"],
    ] as const) {
      const response = await server.handleRequest(
        new Request(`http://localhost${path}`, {
          method,
          headers: method === "GET" ? undefined : { "content-type": "application/json" },
          body: method === "GET" ? undefined : JSON.stringify({}),
        }),
      );
      const payload = await response.json() as { code?: string };
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(payload.code, "INTERNAL_EXCHANGE_DISABLED", `${method} ${path}`);
    }
  } finally {
    server.setApiAuthVerifierForTests(null);
    if (previous === undefined) delete process.env.INTERNAL_EXCHANGE_ENABLED;
    else process.env.INTERNAL_EXCHANGE_ENABLED = previous;
  }
});

test("Polymarket public routes remain available while internal exchange is quarantined", async () => {
  const handleRequest = await getHandleRequest();
  const previous = process.env.INTERNAL_EXCHANGE_ENABLED;
  delete process.env.INTERNAL_EXCHANGE_ENABLED;
  try {
    const response = await handleRequest(new Request("http://localhost/polymarket/orders/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    const payload = await response.json() as { code?: string };
    assert.equal(response.status, 401);
    assert.notEqual(payload.code, "INTERNAL_EXCHANGE_DISABLED");
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_EXCHANGE_ENABLED;
    else process.env.INTERNAL_EXCHANGE_ENABLED = previous;
  }
});

test("production Polymarket command route ignores spoofed x-user-id impersonation", async () => {
  const handleRequest = await getHandleRequest();
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.NODE_ENV = "production";
  try {
    const response = await handleRequest(
      new Request("http://localhost/external/polymarket/orders/route", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "11111111-1111-1111-1111-111111111111",
        },
        body: JSON.stringify({
          userWalletAddress: "0x1111111111111111111111111111111111111111",
          l2CredentialStatus: "present",
          signedOrder: { signature: "redacted" },
          orderInput: { tokenID: "123" },
        }),
      }),
    );

    assert.notEqual(response.status, 401);
    assert.notDeepEqual(await response.json(), { error: "authentication required" });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("admin routes reject spoofed user/admin headers without verified Supabase admin", async () => {
  const handleRequest = await getHandleRequest();
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.NODE_ENV = "production";
  try {
    const response = await handleRequest(
      new Request("http://localhost/admin/ambassador", {
        headers: {
          "x-user-id": "11111111-1111-1111-1111-111111111111",
          "x-admin": "true",
          "x-role": "admin",
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "authentication required" });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("authenticated non-admin receives 403 for admin route even with spoofed x-admin", async () => {
  const server = await getServer();
  server.setApiAuthVerifierForTests(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "user@example.test",
    role: "user",
    claims: {},
  }));
  try {
    const response = await server.handleRequest(
      new Request("http://localhost/admin/ambassador", {
        headers: {
          authorization: "Bearer test-token",
          "x-admin": "true",
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "admin authorization required" });
  } finally {
    server.setApiAuthVerifierForTests(null);
  }
});

test("approved admin role in Supabase app metadata can access admin route", async () => {
  const server = await getServer();
  server.setApiAuthVerifierForTests(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "finance@example.test",
    role: "finance_approver",
    roles: ["finance_approver"],
    claims: { app_metadata: { role: "finance_approver" } },
  }));
  try {
    const response = await server.handleRequest(
      new Request("http://localhost/admin/polymarket/status", {
        headers: { authorization: "Bearer test-token" },
      }),
    );

    assert.notEqual(response.status, 401);
    assert.notEqual(response.status, 403);
  } finally {
    server.setApiAuthVerifierForTests(null);
  }
});

test("Polymarket preflight endpoint requires admin role", async () => {
  const server = await getServer();
  let response = await server.handleRequest(new Request("http://localhost/admin/polymarket/preflight"));
  assert.equal(response.status, 401);

  server.setApiAuthVerifierForTests(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "user@example.test",
    role: "user",
    claims: {},
  }));
  try {
    response = await server.handleRequest(new Request("http://localhost/admin/polymarket/preflight"));
    assert.equal(response.status, 403);
  } finally {
    server.setApiAuthVerifierForTests(null);
  }
});

test("Polymarket status endpoint requires admin role", async () => {
  const server = await getServer();
  let response = await server.handleRequest(new Request("http://localhost/admin/polymarket/status"));
  assert.equal(response.status, 401);

  server.setApiAuthVerifierForTests(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "user@example.test",
    role: "user",
    claims: {},
  }));
  try {
    response = await server.handleRequest(new Request("http://localhost/admin/polymarket/status"));
    assert.equal(response.status, 403);
  } finally {
    server.setApiAuthVerifierForTests(null);
  }
});

test("userId in command body cannot authenticate or impersonate", async () => {
  const handleRequest = await getHandleRequest();
  const response = await handleRequest(
    new Request("http://localhost/ambassador/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "11111111-1111-4111-8111-111111111111",
        code: "FRIEND",
      }),
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication required" });
});

test("ambassador dashboard rejects spoofed x-user-id without bearer auth", async () => {
  const handleRequest = await getHandleRequest();
  const response = await handleRequest(
    new Request("http://localhost/ambassador/dashboard", {
      headers: {
        "x-user-id": "11111111-1111-4111-8111-111111111111",
        "x-admin": "true",
      },
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication required" });
});

test("ambassador capture endpoint applies authenticated referral code", async () => {
  const server = await getServer();
  let captured: { userId?: string; code: string } | null = null;
  server.setApiAuthVerifierForTests(async () => ({
    id: "44444444-4444-4444-8444-444444444444",
    email: "new@example.test",
    role: "user",
    claims: {},
  }));
  server.setAmbassadorCaptureHandlerForTests(async (input) => {
    captured = input;
    return {
      ambassadorCode: {
        id: "11111111-1111-4111-8111-111111111111",
        code: "NEWUSER1",
        ownerUserId: input.userId ?? "",
        status: "active",
        createdAt: "2026-04-01T00:00:00.000Z",
        disabledAt: null,
        inviteUrl: "http://127.0.0.1:3000/?ref=NEWUSER1",
      },
      attribution: {
        id: "33333333-3333-4333-8333-333333333333",
        referredUserId: input.userId ?? "",
        referrerUserId: "22222222-2222-4222-8222-222222222222",
        ambassadorCode: input.code,
        attributedAt: "2026-04-01T00:00:00.000Z",
        qualificationStatus: "pending",
        rejectionReason: null,
      },
      directReferrals: [],
      rewards: {
        pendingRewards: 0n,
        payableRewards: 0n,
        approvedRewards: 0n,
        paidRewards: 0n,
        voidRewards: 0n,
        directReferralCount: 0,
        directTradingVolumeUsdcAtoms: 0n,
      },
      rewardLedger: [],
      payouts: [],
    };
  });
  try {
    const response = await server.handleRequest(
      new Request("http://localhost/ambassador/capture", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-token" },
        body: JSON.stringify({ ref: "friend001" }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(captured, {
      userId: "44444444-4444-4444-8444-444444444444",
      code: "friend001",
    });
    assert.equal((await response.json()).attribution.ambassadorCode, "friend001");
  } finally {
    server.setAmbassadorCaptureHandlerForTests(null);
    server.setApiAuthVerifierForTests(null);
  }
});

test("ambassador capture endpoint rejects self and disabled referral codes", async () => {
  const server = await getServer();
  server.setApiAuthVerifierForTests(async () => ({
    id: "22222222-2222-4222-8222-222222222222",
    email: "self@example.test",
    role: "user",
    claims: {},
  }));
  server.setAmbassadorCaptureHandlerForTests(async (input) => {
    if (input.code === "SELF001") throw new Error("self-referrals are not allowed");
    if (input.code === "DISABLED001") throw new Error("ambassador code is disabled");
    throw new Error("unexpected code");
  });
  try {
    for (const [code, message] of [
      ["SELF001", /self-referrals are not allowed/],
      ["DISABLED001", /ambassador code is disabled/],
    ] as const) {
      const response = await server.handleRequest(
        new Request("http://localhost/ambassador/capture", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer test-token" },
          body: JSON.stringify({ code }),
        }),
      );
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, message);
    }
  } finally {
    server.setAmbassadorCaptureHandlerForTests(null);
    server.setApiAuthVerifierForTests(null);
  }
});

test("wallet link route rejects unauthenticated request and spoofed x-user-id", async () => {
  const handleRequest = await getHandleRequest();
  const response = await handleRequest(
    new Request("http://localhost/wallets/link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "11111111-1111-4111-8111-111111111111",
      },
      body: JSON.stringify({
        walletAddress: "0x1111111111111111111111111111111111111111",
        signedMessage: "Bet wallet link\nuser:11111111-1111-4111-8111-111111111111\nnonce:test",
        signature: "0x00",
      }),
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication required" });
});

test("wallet link route rejects unverified wallet ownership", async () => {
  const server = await getServer();
  server.setApiAuthVerifierForTests(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "user@example.test",
    role: "user",
    claims: {},
  }));
  try {
    const response = await server.handleRequest(
      new Request("http://localhost/wallets/link", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-token" },
        body: JSON.stringify({
          walletAddress: "0x1111111111111111111111111111111111111111",
          signedMessage: "Bet wallet link\nuser:wrong-user\nnonce:test",
          signature: "0x00",
        }),
      }),
    );

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /invalid wallet link challenge|user mismatch/);
  } finally {
    server.setApiAuthVerifierForTests(null);
  }
});
