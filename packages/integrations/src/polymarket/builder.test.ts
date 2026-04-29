import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPolymarketBuilderConfigured,
  attachBuilderCodeToOrder,
  getPolymarketBuilderCode,
} from "./builder";

const VALID_BUILDER_CODE = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";

const withBuilderCode = (value: string | null, run: () => void): void => {
  const previous = process.env.POLY_BUILDER_CODE;

  if (value === null) {
    delete process.env.POLY_BUILDER_CODE;
  } else {
    process.env.POLY_BUILDER_CODE = value;
  }

  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.POLY_BUILDER_CODE;
    } else {
      process.env.POLY_BUILDER_CODE = previous;
    }
  }
};

test("valid Polymarket builder code is accepted", () => {
  withBuilderCode(VALID_BUILDER_CODE, () => {
    assert.equal(getPolymarketBuilderCode(), VALID_BUILDER_CODE);
    assert.equal(assertPolymarketBuilderConfigured(), VALID_BUILDER_CODE);
  });
});

test("invalid Polymarket builder code is rejected", () => {
  withBuilderCode("0x1234", () => {
    assert.throws(() => getPolymarketBuilderCode(), /bytes32 hex string/);
  });
});

test("missing Polymarket builder code returns null and assert rejects", () => {
  withBuilderCode(null, () => {
    assert.equal(getPolymarketBuilderCode(), null);
    assert.throws(() => assertPolymarketBuilderConfigured(), /POLY_BUILDER_CODE is required/);
  });
});

test("order input receives builderCode without mutating the original order", () => {
  withBuilderCode(VALID_BUILDER_CODE, () => {
    const orderInput = {
      tokenID: "123",
      side: "BUY",
      price: 0.55,
      size: 100,
    };

    const attributed = attachBuilderCodeToOrder(orderInput);

    assert.deepEqual(orderInput, {
      tokenID: "123",
      side: "BUY",
      price: 0.55,
      size: 100,
    });
    assert.equal(attributed.builderCode, VALID_BUILDER_CODE);
    assert.equal(attributed.tokenID, "123");
  });
});
