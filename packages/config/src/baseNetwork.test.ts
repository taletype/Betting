import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  BASE_MAINNET_CHAIN_ID,
  getBaseNetworkByChainId,
  readBaseChainId,
  readBaseRpcUrl,
} from "./baseNetwork";

test("Base mainnet remains the production chain", () => {
  const previousChainId = process.env.BASE_CHAIN_ID;
  const previousRpcUrl = process.env.BASE_RPC_URL;

  process.env.BASE_CHAIN_ID = String(BASE_MAINNET_CHAIN_ID);
  delete process.env.BASE_RPC_URL;

  try {
    assert.equal(readBaseChainId(), 8453);
    assert.equal(getBaseNetworkByChainId(readBaseChainId()).name, "mainnet");
    assert.equal(readBaseRpcUrl(), "https://mainnet.base.org");
  } finally {
    if (previousChainId === undefined) delete process.env.BASE_CHAIN_ID;
    else process.env.BASE_CHAIN_ID = previousChainId;

    if (previousRpcUrl === undefined) delete process.env.BASE_RPC_URL;
    else process.env.BASE_RPC_URL = previousRpcUrl;
  }
});

test("generic Ethereum Sepolia chain id is not supported", () => {
  const previousChainId = process.env.BASE_CHAIN_ID;
  process.env.BASE_CHAIN_ID = "11155111";

  try {
    assert.throws(() => readBaseChainId(), /8453, 84532/);
  } finally {
    if (previousChainId === undefined) delete process.env.BASE_CHAIN_ID;
    else process.env.BASE_CHAIN_ID = previousChainId;
  }
});

test("env example does not expose generic Ethereum Sepolia variables", () => {
  const repoRoot = resolve(process.cwd(), "../..");
  const envExample = readFileSync(resolve(repoRoot, ".env.example"), "utf8");

  assert.doesNotMatch(envExample, /SEPOLIA_RPC_URL|ETHEREUM_SEPOLIA|11155111/);
  assert.doesNotMatch(envExample, /SOLANA_RPC_URL/);
  assert.match(envExample, /BASE_CHAIN_ID=8453/);
  assert.match(envExample, /POLYMARKET_ROUTED_TRADING_ENABLED=false/);
  assert.match(envExample, /POLY_BUILDER_CODE=\n/);
});
