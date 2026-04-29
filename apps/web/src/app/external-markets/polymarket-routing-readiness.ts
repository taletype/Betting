export type PolymarketRoutingReadiness =
  | "submit_mode_disabled"
  | "builder_code_missing"
  | "feature_disabled"
  | "wallet_not_connected"
  | "credentials_missing"
  | "market_not_tradable"
  | "submitter_unavailable"
  | "signature_required"
  | "ready_to_submit"
  | "submitted";

export interface PolymarketRoutingReadinessInput {
  hasBuilderCode: boolean;
  featureEnabled: boolean;
  submitModeEnabled?: boolean;
  walletConnected: boolean;
  hasCredentials: boolean;
  marketTradable: boolean;
  submitterAvailable: boolean;
  userSigned?: boolean;
  submitted?: boolean;
}

export const getPolymarketRoutingReadiness = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness => {
  if (!input.featureEnabled) return "feature_disabled";
  if (input.submitModeEnabled === false) return "submit_mode_disabled";
  if (!input.hasBuilderCode) return "builder_code_missing";
  if (!input.walletConnected) return "wallet_not_connected";
  if (!input.hasCredentials) return "credentials_missing";
  if (!input.marketTradable) return "market_not_tradable";
  if (!input.submitterAvailable) return "submitter_unavailable";
  if (input.submitted) return "submitted";
  if (!input.userSigned) return "signature_required";
  return "ready_to_submit";
};

export const getPolymarketRoutingDisabledReasons = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness[] => {
  const reasons: PolymarketRoutingReadiness[] = [];

  if (!input.featureEnabled) reasons.push("feature_disabled");
  if (input.submitModeEnabled === false) reasons.push("submit_mode_disabled");
  if (!input.walletConnected) reasons.push("wallet_not_connected");
  if (!input.hasCredentials) reasons.push("credentials_missing");
  if (!input.hasBuilderCode) reasons.push("builder_code_missing");
  if (!input.marketTradable) reasons.push("market_not_tradable");
  if (!input.submitterAvailable) reasons.push("submitter_unavailable");

  return reasons;
};

export const isPolymarketRoutingFullyEnabled = (input: PolymarketRoutingReadinessInput): boolean =>
  getPolymarketRoutingReadiness({ ...input, userSigned: true }) === "ready_to_submit";
