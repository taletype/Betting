import {
  environment,
  readEthereumAddress,
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
  readEthereumAddress("BASE_USDC_ADDRESS", {
    defaultInLocal: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  });

  readRequiredUrl("BASE_RPC_URL", { defaultInLocal: "https://mainnet.base.org" });

  readPositiveInteger("BASE_MIN_CONFIRMATIONS", { defaultInLocal: 3 });
  readPositiveInteger("BASE_RECON_MIN_CONFIRMATIONS", { defaultInLocal: 12 });
};
