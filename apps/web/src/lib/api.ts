import {
  MarketSnapshotSchema,
  MarketTradesSchema,
  OrderBookSchema,
  PortfolioSnapshotSchema,
} from "@bet/contracts";

const getApiBaseUrl = (): string =>
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

const readApiJson = async (
  path: string,
  options?: { allowNotFound?: boolean; method?: string; body?: unknown },
) => {
  const response = await fetch(new URL(path, getApiBaseUrl()).toString(), {
    method: options?.method ?? "GET",
    headers: {
      "content-type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (options?.allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `API request failed for ${path}: ${response.status}`);
  }

  return response.json();
};

export const toBigInt = (value: string | number | bigint | null | undefined): bigint => {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  if (!value) {
    return 0n;
  }

  return BigInt(value);
};

export const listMarkets = async () =>
  MarketSnapshotSchema.array().parse(await readApiJson("/markets"));

export const getMarket = async (marketId: string) => {
  const payload = await readApiJson(`/markets/${marketId}`, { allowNotFound: true });

  if (payload === null) {
    return null;
  }

  return MarketSnapshotSchema.nullable().parse((payload as { market: unknown }).market);
};

export const getOrderBook = async (marketId: string) =>
  OrderBookSchema.parse(await readApiJson(`/markets/${marketId}/orderbook`));

export const getRecentTrades = async (marketId: string) =>
  MarketTradesSchema.parse(await readApiJson(`/markets/${marketId}/trades`));

export const getPortfolio = async () =>
  PortfolioSnapshotSchema.parse(await readApiJson("/portfolio"));

export const linkWallet = async (input: {
  walletAddress: string;
  signature: string;
  signedMessage: string;
}) => readApiJson("/wallets/link", { method: "POST", body: input });

export const verifyDepositTx = async (txHash: string) =>
  readApiJson("/deposits/verify", { method: "POST", body: { txHash } });
