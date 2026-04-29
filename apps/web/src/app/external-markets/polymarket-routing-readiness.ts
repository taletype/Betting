export type PolymarketRoutingReadiness =
  | "auth_required"
  | "submit_mode_disabled"
  | "builder_code_missing"
  | "feature_disabled"
  | "wallet_not_connected"
  | "geoblocked"
  | "credentials_missing"
  | "market_not_tradable"
  | "invalid_order"
  | "submitter_unavailable"
  | "signature_required"
  | "ready_to_submit"
  | "submitted";

export interface PolymarketRoutingReadinessInput {
  loggedIn?: boolean;
  hasBuilderCode: boolean;
  featureEnabled: boolean;
  submitModeEnabled?: boolean;
  walletConnected: boolean;
  geoblockAllowed?: boolean;
  hasCredentials: boolean;
  userSigningAvailable?: boolean;
  marketTradable: boolean;
  orderValid?: boolean;
  submitterAvailable: boolean;
  userSigned?: boolean;
  submitted?: boolean;
}

export const getPolymarketRoutingReadiness = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness => {
  if (input.loggedIn === false) return "auth_required";
  if (!input.hasBuilderCode) return "builder_code_missing";
  if (!input.featureEnabled) return "feature_disabled";
  if (input.submitModeEnabled === false) return "submit_mode_disabled";
  if (!input.walletConnected) return "wallet_not_connected";
  if (input.geoblockAllowed === false) return "geoblocked";
  if (!input.hasCredentials) return "credentials_missing";
  if (input.userSigningAvailable === false) return "signature_required";
  if (!input.marketTradable) return "market_not_tradable";
  if (input.orderValid === false) return "invalid_order";
  if (!input.submitterAvailable) return "submitter_unavailable";
  if (input.submitted) return "submitted";
  if (!input.userSigned) return "signature_required";
  return "ready_to_submit";
};

export const getPolymarketRoutingDisabledReasons = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness[] => {
  const reasons: PolymarketRoutingReadiness[] = [];

  if (input.loggedIn === false) reasons.push("auth_required");
  if (!input.walletConnected) reasons.push("wallet_not_connected");
  if (input.geoblockAllowed === false) reasons.push("geoblocked");
  if (!input.hasCredentials) reasons.push("credentials_missing");
  if (input.userSigningAvailable === false) reasons.push("signature_required");
  if (!input.hasBuilderCode) reasons.push("builder_code_missing");
  if (!input.featureEnabled) reasons.push("feature_disabled");
  if (!input.marketTradable) reasons.push("market_not_tradable");
  if (input.orderValid === false) reasons.push("invalid_order");
  if (input.submitModeEnabled === false) reasons.push("submit_mode_disabled");
  if (!input.submitterAvailable) reasons.push("submitter_unavailable");

  return reasons;
};

export const isPolymarketRoutingFullyEnabled = (input: PolymarketRoutingReadinessInput): boolean =>
  getPolymarketRoutingReadiness({ ...input, userSigned: true }) === "ready_to_submit";
