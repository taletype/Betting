export const MARKET_STATES = ["draft", "open", "halted", "resolved", "cancelled"] as const;

export type MarketState = (typeof MARKET_STATES)[number];

export const isTradableMarketState = (state: MarketState): boolean =>
  state === "open";
