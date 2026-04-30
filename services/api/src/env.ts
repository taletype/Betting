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
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_CANARY_ONLY", { defaultValue: true });
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_KILL_SWITCH", { defaultValue: false });
  readBooleanFlag("POLYMARKET_ORDER_SUBMIT_KILL_SWITCH", { defaultValue: false });
  readBooleanFlag("MARKET_TRANSLATION_ENABLED", { defaultValue: true });
  readRequiredStringLike("GROQ_TRANSLATION_MODEL", "qwen/qwen3-32b");
  readRequiredStringLike("MARKET_TRANSLATION_DEFAULT_LOCALE", "zh-HK");
  readStringList("MARKET_TRANSLATION_LOCALES", {
    defaultValue: ["zh-HK", "zh-TW", "zh-CN"],
    allowed: ["zh-HK", "zh-TW", "zh-CN"],
  });
  getAmbassadorRewardsConfig();
};

const readRequiredStringLike = (name: string, defaultValue: string): string => {
  const value = process.env[name]?.trim() || defaultValue;
  if (!value) throw new Error(`${name} must not be empty`);
  return value;
};
