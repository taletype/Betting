const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

const readChainId = (): number => {
  const value = process.env.NEXT_PUBLIC_BASE_CHAIN_ID?.trim();
  if (!value) {
    return BASE_MAINNET_CHAIN_ID;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : BASE_MAINNET_CHAIN_ID;
};

const resolveExplorer = (chainId: number): string => {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return "https://basescan.org";
  }

  return "https://sepolia-explorer.base.org";
};

const chainId = readChainId();

export const baseChainId = chainId;
export const baseNetworkLabel = chainId === BASE_MAINNET_CHAIN_ID ? "Base Mainnet" : "Base Sepolia";

export const baseExplorerUrl =
  process.env.NEXT_PUBLIC_BASE_EXPLORER_URL?.trim() || resolveExplorer(chainId);

export const baseSettlementAsset = process.env.NEXT_PUBLIC_BASE_SETTLEMENT_ASSET?.trim() || "USDC";

export const baseTreasuryAddress = process.env.NEXT_PUBLIC_BASE_TREASURY_ADDRESS?.trim() || "";

export const baseUsdcAddress = process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS?.trim() || "";

export const formatBaseExplorerTxUrl = (txHash: string): string =>
  `${baseExplorerUrl.replace(/\/$/, "")}/tx/${txHash}`;
