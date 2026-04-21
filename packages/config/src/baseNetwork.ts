import { environment, readChainId, readRequiredUrl } from "./env";

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export type BaseNetwork = "mainnet" | "sepolia";

export interface BaseNetworkConfig {
  name: BaseNetwork;
  chainId: number;
  rpcHttp: string;
  rpcWs: string;
  explorer: string;
}

export const BASE_NETWORKS: Record<BaseNetwork, BaseNetworkConfig> = {
  mainnet: {
    name: "mainnet",
    chainId: BASE_MAINNET_CHAIN_ID,
    rpcHttp: "https://mainnet.base.org",
    rpcWs: "wss://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  sepolia: {
    name: "sepolia",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcHttp: "https://sepolia.base.org",
    rpcWs: "wss://sepolia.base.org",
    explorer: "https://sepolia-explorer.base.org",
  },
};

export const DEFAULT_BASE_NETWORK: BaseNetwork = environment.isProduction ? "mainnet" : "sepolia";

const SUPPORTED_BASE_CHAIN_IDS = [BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID] as const;

export const readBaseChainId = (): number =>
  readChainId("BASE_CHAIN_ID", {
    defaultValue: BASE_NETWORKS[DEFAULT_BASE_NETWORK].chainId,
    supported: SUPPORTED_BASE_CHAIN_IDS,
  });

export const getBaseNetworkByChainId = (chainId: number): BaseNetworkConfig => {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return BASE_NETWORKS.mainnet;
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return BASE_NETWORKS.sepolia;
  }

  throw new Error(`Unsupported Base chain id: ${chainId}`);
};

export const resolveBaseNetwork = (): BaseNetworkConfig => getBaseNetworkByChainId(readBaseChainId());

export const readBaseRpcUrl = (): string =>
  readRequiredUrl("BASE_RPC_URL", { defaultValue: resolveBaseNetwork().rpcHttp });

export const readBaseWsUrl = (): string =>
  readRequiredUrl("BASE_WS_URL", { defaultValue: resolveBaseNetwork().rpcWs });

export const readBaseExplorerUrl = (): string =>
  readRequiredUrl("BASE_EXPLORER_URL", { defaultValue: resolveBaseNetwork().explorer });
