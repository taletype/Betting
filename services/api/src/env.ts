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
} from "@bet/config";

const localAdminToken = "dev-admin-token";

export const getAdminApiToken = (): string =>
  environment.isLocal
    ? process.env.ADMIN_API_TOKEN?.trim() || localAdminToken
    : readSecret("ADMIN_API_TOKEN");

export const validateApiEnvironment = (): void => {
  readRequiredUrl("API_BASE_URL", { defaultInLocal: "http://localhost:4000" });

  readEthereumAddress("BASE_TREASURY_ADDRESS");
  readEthereumAddress("BASE_USDC_ADDRESS");

  readBaseChainId();
  readBaseRpcUrl();
  readBaseWsUrl();
  readBaseExplorerUrl();

  readPositiveInteger("BASE_MIN_CONFIRMATIONS", { defaultInLocal: 3 });
  readPositiveInteger("BASE_RECON_MIN_CONFIRMATIONS", { defaultInLocal: 12 });

  readOptionalBytes32Hex("POLY_BUILDER_CODE");
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_ENABLED", { defaultValue: false });
};
