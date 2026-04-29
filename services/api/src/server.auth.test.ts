import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

const getHandleRequest = async () => (await import("./server")).handleRequest;

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

test("admin routes reject spoofed user headers without verified admin token", async () => {
  const handleRequest = await getHandleRequest();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAdminToken = process.env.ADMIN_API_TOKEN;

  process.env.NODE_ENV = "production";
  process.env.ADMIN_API_TOKEN = "real-admin-token-for-test";
  try {
    const response = await handleRequest(
      new Request("http://localhost/admin/ambassador", {
        headers: {
          "x-user-id": "11111111-1111-1111-1111-111111111111",
          "x-admin-token": "wrong-token",
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "admin authorization required" });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousAdminToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = previousAdminToken;
  }
});
