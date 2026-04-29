export type PolymarketRoutingReadiness =
  | "builder_code_missing"
  | "feature_disabled"
  | "wallet_not_connected"
  | "credentials_missing"
  | "market_not_tradable"
  | "submitter_unavailable"
  | "ready_to_route";

export interface PolymarketRoutingReadinessInput {
  hasBuilderCode: boolean;
  featureEnabled: boolean;
  walletConnected: boolean;
  hasCredentials: boolean;
  marketTradable: boolean;
  submitterAvailable: boolean;
}

export const getPolymarketRoutingReadiness = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness => {
  if (!input.hasBuilderCode) return "builder_code_missing";
  if (!input.featureEnabled) return "feature_disabled";
  if (!input.walletConnected) return "wallet_not_connected";
  if (!input.hasCredentials) return "credentials_missing";
  if (!input.marketTradable) return "market_not_tradable";
  if (!input.submitterAvailable) return "submitter_unavailable";
  return "ready_to_route";
};
