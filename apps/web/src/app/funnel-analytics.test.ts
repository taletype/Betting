import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeFunnelMetadata } from "./funnel-analytics";

test("funnel metadata redacts forbidden secret-bearing keys and values", () => {
  assert.deepEqual(
    sanitizeFunnelMetadata({
      market: "polymarket",
      signature: "0xabc",
      authHeader: "Bearer token",
      note: "contains private_key material",
      count: 1,
    }),
    {
      market: "polymarket",
      signature: "[redacted]",
      authHeader: "[redacted]",
      note: "[redacted]",
      count: 1,
    },
  );
});
