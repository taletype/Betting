export type AppLaunchMode = "beta" | "production";

const readBoolean = (value: string | undefined, fallback = false): boolean => {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

export const getAppLaunchMode = (): AppLaunchMode =>
  process.env.NEXT_PUBLIC_APP_LAUNCH_MODE === "production" ? "production" : "beta";

export const getPublicBetaLaunchState = () => ({
  mode: getAppLaunchMode(),
  isBeta: getAppLaunchMode() === "beta",
  routedTradingEnabled: readBoolean(process.env.POLYMARKET_ROUTED_TRADING_ENABLED, false),
  autoPayoutEnabled: readBoolean(process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED, false),
});

