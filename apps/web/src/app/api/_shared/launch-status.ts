import { getPolymarketBuilderCode } from "@bet/integrations";

const readBoolean = (name: string, defaultValue = false): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value);
};

const hasBuilderCode = (): boolean => {
  try {
    return getPolymarketBuilderCode() !== null;
  } catch {
    return false;
  }
};

export const getSafeLaunchStatus = () => ({
  externalMarketData: {
    status: "available_or_empty",
  },
  supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  builderCodeConfigured: hasBuilderCode(),
  routedTradingEnabled: readBoolean("POLYMARKET_ROUTED_TRADING_ENABLED", false),
  clobSubmitterMode: process.env.POLYMARKET_CLOB_SUBMITTER === "real" ? "real" : "disabled",
  rewardsEnabled: readBoolean("AMBASSADOR_REWARDS_ENABLED", false),
  autoPayoutEnabled: readBoolean("AMBASSADOR_AUTO_PAYOUT_ENABLED", false),
  checkedAt: new Date().toISOString(),
});
