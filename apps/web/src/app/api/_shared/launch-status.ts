import { getPolymarketBuilderCode } from "@bet/integrations";

const readBoolean = (name: string, defaultValue = false): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value);
};

const readEnvList = (name: string): string[] =>
  (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const hasBuilderCode = (): boolean => {
  try {
    return getPolymarketBuilderCode() !== null;
  } catch {
    return false;
  }
};

export const isPolymarketRoutedTradingAllowlisted = (input: {
  userId?: string | null;
  email?: string | null;
  walletAddress?: string | null;
}): boolean => {
  const allowlist = readEnvList("POLYMARKET_ROUTED_TRADING_ALLOWLIST");
  const canaryUsers = readEnvList("POLYMARKET_ROUTED_TRADING_CANARY_USER_IDS");
  const canaryEmails = readEnvList("POLYMARKET_ROUTED_TRADING_CANARY_EMAILS");
  const canaryWallets = readEnvList("POLYMARKET_ROUTED_TRADING_CANARY_WALLETS");
  const userId = input.userId?.trim().toLowerCase();
  const email = input.email?.trim().toLowerCase();
  const wallet = input.walletAddress?.trim().toLowerCase();

  return Boolean(
    (userId && (allowlist.includes(userId) || canaryUsers.includes(userId))) ||
    (email && (allowlist.includes(email) || canaryEmails.includes(email))) ||
    (wallet && canaryWallets.includes(wallet)),
  );
};

export const getSafeLaunchStatus = () => ({
  launchMode: process.env.NEXT_PUBLIC_APP_LAUNCH_MODE === "production" ? "production" : "beta",
  externalMarketData: {
    status: "available_or_empty",
  },
  supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  builderCodeConfigured: hasBuilderCode(),
  routedTradingEnabled: readBoolean("POLYMARKET_ROUTED_TRADING_ENABLED", false),
  routedTradingBetaEnabled: readBoolean("POLYMARKET_ROUTED_TRADING_BETA_ENABLED", false),
  routedTradingCanaryOnly: readBoolean("POLYMARKET_ROUTED_TRADING_CANARY_ONLY", true),
  routedTradingKillSwitch: readBoolean("POLYMARKET_ROUTED_TRADING_KILL_SWITCH", false) || readBoolean("POLYMARKET_ORDER_SUBMIT_KILL_SWITCH", false),
  routedTradingCanaryAllowlistCount: new Set(
    [
      process.env.POLYMARKET_ROUTED_TRADING_ALLOWLIST,
      process.env.POLYMARKET_ROUTED_TRADING_CANARY_USER_IDS,
      process.env.POLYMARKET_ROUTED_TRADING_CANARY_EMAILS,
      process.env.POLYMARKET_ROUTED_TRADING_CANARY_WALLETS,
    ]
      .flatMap((value) => (value ?? "").split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ).size,
  clobSubmitterMode: process.env.POLYMARKET_CLOB_SUBMITTER === "real" ? "real" : "disabled",
  rewardsEnabled: readBoolean("AMBASSADOR_REWARDS_ENABLED", false),
  autoPayoutEnabled: readBoolean("AMBASSADOR_AUTO_PAYOUT_ENABLED", false),
  checkedAt: new Date().toISOString(),
});
