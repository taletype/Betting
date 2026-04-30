import {
  environment,
  readBooleanFlag,
  readBaseChainId,
  readBaseExplorerUrl,
  readBaseRpcUrl,
  readBaseWsUrl,
  readEthereumAddress,
  readOptionalBytes32Hex,
  readPositiveInteger,
  readRequiredUrl,
  readSecret,
  readStringList,
} from "@bet/config";

import { getAmbassadorRewardsConfig } from "./modules/ambassador/repository";

const localAdminToken = "dev-admin-token";

export const getAdminApiToken = (): string =>
  environment.isLocal
    ? process.env.ADMIN_API_TOKEN?.trim() || localAdminToken
    : readSecret("ADMIN_API_TOKEN");

const validateEthereumAddressIfConfigured = (name: string): void => {
  if (process.env[name]?.trim()) {
    readEthereumAddress(name);
  }
};

const validatePolymarketSubmitterEnv = (): void => {
  const submitterMode = process.env.POLYMARKET_CLOB_SUBMITTER?.trim() || "disabled";
  if (!["disabled", "real"].includes(submitterMode)) {
    throw new Error("POLYMARKET_CLOB_SUBMITTER must be disabled or real");
  }

  if (process.env.POLYMARKET_CLOB_URL?.trim()) {
    readRequiredUrl("POLYMARKET_CLOB_URL");
  }

  for (const name of [
    "POLYMARKET_API_KEY",
    "POLYMARKET_API_SECRET",
    "POLYMARKET_API_PASSPHRASE",
    "POLYMARKET_CLOB_API_KEY",
    "POLYMARKET_CLOB_SECRET",
    "POLYMARKET_CLOB_PASSPHRASE",
  ]) {
    if (process.env[name]?.trim()) {
      throw new Error(`${name} must not be configured for routed user trading; use only user-owned L2 credentials`);
    }
  }
};

export const validateApiEnvironment = (): void => {
  readRequiredUrl("API_BASE_URL", { defaultInLocal: "http://localhost:4000" });

  if (environment.isLocal) {
    validateEthereumAddressIfConfigured("BASE_TREASURY_ADDRESS");
    validateEthereumAddressIfConfigured("BASE_USDC_ADDRESS");
  } else {
    readEthereumAddress("BASE_TREASURY_ADDRESS");
    readEthereumAddress("BASE_USDC_ADDRESS");
  }

  readBaseChainId();
  readBaseRpcUrl();
  readBaseWsUrl();
  readBaseExplorerUrl();

  readPositiveInteger("BASE_MIN_CONFIRMATIONS", { defaultInLocal: 3 });
  readPositiveInteger("BASE_RECON_MIN_CONFIRMATIONS", { defaultInLocal: 12 });

  readOptionalBytes32Hex("POLY_BUILDER_CODE");
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_ENABLED", { defaultValue: false });
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_BETA_ENABLED", { defaultValue: false });
  readStringList("POLYMARKET_ROUTED_TRADING_ALLOWLIST", { defaultValue: [] });
  validatePolymarketSubmitterEnv();
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_CANARY_ONLY", { defaultValue: true });
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_KILL_SWITCH", { defaultValue: false });
  readBooleanFlag("POLYMARKET_ORDER_SUBMIT_KILL_SWITCH", { defaultValue: false });
  readBooleanFlag("MARKET_TRANSLATION_ENABLED", { defaultValue: true });
  readRequiredStringLike("GROQ_TRANSLATION_MODEL", "qwen/qwen3-32b");
  readRequiredStringLike("MARKET_TRANSLATION_DEFAULT_LOCALE", "zh-HK");
  readStringList("MARKET_TRANSLATION_LOCALES", {
    defaultValue: ["zh-HK", "zh-CN"],
    allowed: ["zh-HK", "zh-CN"],
  });
  getAmbassadorRewardsConfig();
};

const readRequiredStringLike = (name: string, defaultValue: string): string => {
  const value = process.env[name]?.trim() || defaultValue;
  if (!value) throw new Error(`${name} must not be empty`);
  return value;
};
