import { demoMarkets } from "./data";

export const listMarkets = () => demoMarkets;

export const getMarketById = (marketId: string) =>
  demoMarkets.find((market) => market.id === marketId) ?? null;
