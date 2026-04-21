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
