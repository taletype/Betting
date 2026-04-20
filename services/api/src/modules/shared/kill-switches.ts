const TRUE_VALUE = "true";

const isTrue = (value: string | undefined): boolean => value?.trim().toLowerCase() === TRUE_VALUE;

const parseCsvSet = (value: string | undefined): Set<string> =>
  new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

export const isGlobalOrderPlacementDisabled = (): boolean =>
  isTrue(process.env.OP_DISABLE_ORDER_PLACEMENT);

export const isOrderPlacementDisabledForMarket = (marketId: string): boolean => {
  const haltedMarketIds = parseCsvSet(process.env.OP_DISABLED_ORDER_MARKET_IDS);
  return haltedMarketIds.has(marketId);
};

export const isDepositVerificationDisabled = (): boolean =>
  isTrue(process.env.OP_DISABLE_DEPOSIT_VERIFY);

export const isWithdrawalRequestDisabled = (): boolean =>
  isTrue(process.env.OP_DISABLE_WITHDRAWAL_REQUEST);
