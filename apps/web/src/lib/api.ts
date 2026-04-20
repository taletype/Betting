import {
  MarketSnapshotSchema,
  MarketTradesSchema,
  OrderBookSchema,
  PortfolioSnapshotSchema,
} from "@bet/contracts";

const getApiBaseUrl = (): string =>
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

const readApiJson = async (path: string, options?: { allowNotFound?: boolean }) => {
  const response = await fetch(new URL(path, getApiBaseUrl()).toString(), {
    cache: "no-store",
  });

  if (options?.allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`API request failed for ${path}: ${response.status}`);
  }

  return response.json();
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
