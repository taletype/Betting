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
      new Request("http://localhost/portfolio", {
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

test("production command route rejects spoofed x-user-id impersonation", async () => {
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

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "authentication required" });
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
    assert.match((await response.json()).error, /user mismatch/);
  } finally {
    server.setApiAuthVerifierForTests(null);
  }
});
