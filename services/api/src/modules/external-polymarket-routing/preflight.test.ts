import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePolymarketPreflight } from "./preflight";

const validBuilderCode = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";

const withEnv = (values: Record<string, string | undefined>, run: () => void) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("preflight is blocked when live trading feature flag is false", () => {
  withEnv({ POLY_BUILDER_CODE: validBuilderCode, POLYMARKET_ROUTED_TRADING_ENABLED: "false" }, () => {
    const result = evaluatePolymarketPreflight();
    assert.equal(result.status, "blocked");
    assert.equal(result.liveTradingEnabled, false);
    assert.equal(result.checks.find((check) => check.id === "feature_flag_enabled")?.status, "fail");
  });
});

test("preflight is blocked when signature or geoblock verifier is missing", () => {
  withEnv({
    POLYMARKET_ROUTED_TRADING_ENABLED: "true",
    POLYMARKET_CLOB_SUBMITTER: "real",
    POLYMARKET_USER_SIGNATURE_VERIFIER_IMPLEMENTED: "false",
    POLYMARKET_GEOBLOCK_PROOF_VERIFIER_IMPLEMENTED: "false",
  }, () => {
    const result = evaluatePolymarketPreflight();
    assert.equal(result.status, "blocked");
    assert.equal(result.checks.find((check) => check.id === "signature_verifier")?.status, "fail");
    assert.equal(result.checks.find((check) => check.id === "geoblock_verifier")?.status, "fail");
  });
});

test("preflight is blocked when submitter is disabled and does not expose secrets", () => {
  withEnv({ POLYMARKET_CLOB_SUBMITTER: "disabled", POLYMARKET_API_SECRET: "super-secret-value" }, () => {
    const serialized = JSON.stringify(evaluatePolymarketPreflight());
    assert.match(serialized, /blocked/);
    assert.doesNotMatch(serialized, /super-secret-value|POLYMARKET_API_SECRET/);
  });
});

test("invalid builder code is a blocked readiness state instead of a secret-bearing crash", () => {
  withEnv({ POLY_BUILDER_CODE: "0x1234", POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, () => {
    const result = evaluatePolymarketPreflight();
    const serialized = JSON.stringify(result);

    assert.equal(result.status, "blocked");
    assert.equal(result.builderCodeConfigured, false);
    assert.equal(result.checks.find((check) => check.id === "builder_code_configured")?.status, "warning");
    assert.doesNotMatch(serialized, /0x1234/);
  });
});
