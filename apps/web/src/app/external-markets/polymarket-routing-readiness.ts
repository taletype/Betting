export type PolymarketRoutingReadiness =
  | "submit_mode_disabled"
  | "builder_code_missing"
  | "feature_disabled"
  | "beta_user_not_allowlisted"
  | "wallet_not_connected"
  | "wallet_funds_insufficient"
  | "credentials_missing"
  | "market_not_tradable"
  | "invalid_order"
  | "submitter_unavailable"
  | "signature_required"
  | "ready_to_submit"
  | "submitted";

export type PolymarketTradingReadinessCheck =
  | "routedTradingEnabled"
  | "betaUserAllowlisted"
  | "builderCodeConfigured"
  | "walletConnected"
  | "polymarketCredentialsReady"
  | "userCanSignOrder"
  | "marketTradable"
  | "balanceAllowanceReady"
  | "submitterReady"
  | "attributionRecordingReady";

export interface PolymarketTradingReadiness {
  enabled: boolean;
  disabledReason: string;
  missingChecks: PolymarketTradingReadinessCheck[];
  safeToSubmit: boolean;
}

export type PolymarketGeoblockStatus = "unknown" | "checking" | "allowed" | "blocked" | "error" | "stale";

export type PolymarketReadinessChecklistStatus = "complete" | "missing" | "unavailable" | "disabled" | "checking";

export interface PolymarketReadinessChecklistItem {
  id:
    | "wallet"
    | "funding"
    | "credentials"
    | "signature"
    | "builder_code"
    | "trading_feature"
    | "market_status"
    | "order_values"
    | "submitter";
  label: string;
  explanation: string;
  status: PolymarketReadinessChecklistStatus;
  actionHref?: string;
  actionLabel?: string;
}

export interface PolymarketRoutingReadinessInput {
  loggedIn?: boolean;
  hasBuilderCode: boolean;
  featureEnabled: boolean;
  betaUserAllowlisted?: boolean;
  submitModeEnabled?: boolean;
  walletConnected: boolean;
  walletAddressKnown?: boolean;
  walletVerified?: boolean;
  fundingAvailable?: boolean;
  walletFundsSufficient?: boolean;
  geoblockAllowed?: boolean;
  geoblockStatus?: PolymarketGeoblockStatus;
  hasCredentials: boolean;
  userSigningAvailable?: boolean;
  marketTradable: boolean;
  marketTradabilityLabel?: string;
  marketTradabilityReason?: string;
  orderValid?: boolean;
  submitterAvailable: boolean;
  submitterEndpointAvailable?: boolean;
  userSigned?: boolean;
  submitted?: boolean;
  balanceAllowanceReady?: boolean;
  attributionRecordingReady?: boolean;
}

const tradingDisabledReasonZh: Record<PolymarketTradingReadinessCheck, string> = {
  routedTradingEnabled: "實盤提交已停用",
  betaUserAllowlisted: "測試交易功能只限指定用戶",
  builderCodeConfigured: "Builder Code 未設定",
  walletConnected: "連接錢包",
  polymarketCredentialsReady: "設定 Polymarket 交易權限",
  userCanSignOrder: "需要用戶自行簽署訂單",
  marketTradable: "市場暫時不可交易",
  balanceAllowanceReady: "餘額或授權不足",
  submitterReady: "實盤提交已停用",
  attributionRecordingReady: "實盤提交已停用",
};

export const getPolymarketTradingReadiness = (
  input: PolymarketRoutingReadinessInput,
): PolymarketTradingReadiness => {
  const checks: Record<PolymarketTradingReadinessCheck, boolean> = {
    walletConnected: input.walletConnected && input.walletAddressKnown !== false,
    polymarketCredentialsReady: input.hasCredentials,
    userCanSignOrder: input.userSigningAvailable !== false && input.userSigned === true,
    builderCodeConfigured: input.hasBuilderCode,
    routedTradingEnabled: input.featureEnabled,
    submitterReady: input.featureEnabled && input.submitModeEnabled === true && input.submitterAvailable && input.submitterEndpointAvailable !== false,
    betaUserAllowlisted: input.betaUserAllowlisted !== false,
    marketTradable: input.marketTradable && input.orderValid !== false,
    balanceAllowanceReady: input.balanceAllowanceReady !== false && input.walletFundsSufficient !== false,
    attributionRecordingReady: input.attributionRecordingReady !== false,
  };
  const missingChecks = (Object.keys(checks) as PolymarketTradingReadinessCheck[]).filter((check) => !checks[check]);
  const safeToSubmit = missingChecks.length === 0;

  return {
    enabled: safeToSubmit,
    disabledReason: safeToSubmit ? "透過 Polymarket 交易" : tradingDisabledReasonZh[missingChecks[0] ?? "routedTradingEnabled"],
    missingChecks,
    safeToSubmit,
  };
};

export const getPolymarketRoutingReadiness = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness => {
  if (!input.walletConnected) return "wallet_not_connected";
  if (input.walletAddressKnown === false) return "wallet_not_connected";
  if (input.walletFundsSufficient === false || input.fundingAvailable === false) return "wallet_funds_insufficient";
  if (input.walletVerified === false) return "wallet_not_connected";
  if (!input.hasCredentials) return "credentials_missing";
  if (input.userSigningAvailable === false) return "signature_required";
  if (!input.userSigned) return "signature_required";
  if (!input.hasBuilderCode) return "builder_code_missing";
  if (!input.featureEnabled) return "feature_disabled";
  if (input.betaUserAllowlisted === false) return "beta_user_not_allowlisted";
  if (input.submitModeEnabled === false) return "submit_mode_disabled";
  if (!input.submitterAvailable) return "submitter_unavailable";
  if (input.submitterEndpointAvailable === false) return "submitter_unavailable";
  if (!input.marketTradable) return "market_not_tradable";
  if (input.orderValid === false) return "invalid_order";
  if (input.submitted) return "submitted";
  return "ready_to_submit";
};

export const getPolymarketRoutingDisabledReasons = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness[] => {
  const reasons: PolymarketRoutingReadiness[] = [];

  if (!input.walletConnected) reasons.push("wallet_not_connected");
  if (input.walletConnected && input.walletAddressKnown === false) reasons.push("wallet_not_connected");
  if (input.walletFundsSufficient === false || (input.walletConnected && input.fundingAvailable === false)) reasons.push("wallet_funds_insufficient");
  if (!input.hasCredentials) reasons.push("credentials_missing");
  if (input.userSigningAvailable === false || !input.userSigned) reasons.push("signature_required");
  if (!input.hasBuilderCode) reasons.push("builder_code_missing");
  if (!input.featureEnabled) reasons.push("feature_disabled");
  if (input.betaUserAllowlisted === false) reasons.push("beta_user_not_allowlisted");
  if (input.submitModeEnabled === false) reasons.push("submit_mode_disabled");
  if (!input.submitterAvailable) reasons.push("submitter_unavailable");
  if (input.submitterEndpointAvailable === false) reasons.push("submitter_unavailable");
  if (!input.marketTradable) reasons.push("market_not_tradable");
  if (input.orderValid === false) reasons.push("invalid_order");

  return reasons;
};

export const isPolymarketRoutingFullyEnabled = (input: PolymarketRoutingReadinessInput): boolean =>
  getPolymarketRoutingReadiness({ ...input, userSigned: true }) === "ready_to_submit";

export const getPolymarketTopBlockingReason = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness | null => {
  if (!input.walletConnected || input.walletAddressKnown === false) return "wallet_not_connected";
  if (input.walletFundsSufficient === false || input.balanceAllowanceReady === false || (input.walletConnected && input.fundingAvailable === false)) return "wallet_funds_insufficient";
  if (!input.hasCredentials) return "credentials_missing";
  if (input.userSigningAvailable === false || !input.userSigned) return "signature_required";
  if (!input.hasBuilderCode) return "builder_code_missing";
  if (!input.featureEnabled) return "feature_disabled";
  if (input.submitModeEnabled === false) return "submit_mode_disabled";
  if (!input.submitterAvailable || input.submitterEndpointAvailable === false) return "submitter_unavailable";
  if (input.betaUserAllowlisted === false) return "beta_user_not_allowlisted";
  if (!input.marketTradable) return "market_not_tradable";
  if (input.orderValid === false) return "invalid_order";
  if (input.submitted) return null;
  return null;
};

export const getPolymarketGeoblockStatusLabel = (_status: PolymarketGeoblockStatus): string => "所在地區由 Polymarket 判斷";

export const getPolymarketReadinessChecklist = (
  input: PolymarketRoutingReadinessInput,
): PolymarketReadinessChecklistItem[] => {
  return [
    {
      id: "wallet",
      label: "錢包",
      explanation: input.walletConnected && input.walletAddressKnown !== false
        ? "已連接用戶自己的錢包。"
        : "需要連接用戶自己的錢包；不需要先登入帳戶。",
      status: input.walletConnected && input.walletAddressKnown !== false ? "complete" : "missing",
      actionHref: input.walletConnected && input.walletAddressKnown !== false ? undefined : "/account",
      actionLabel: input.walletConnected && input.walletAddressKnown !== false ? undefined : "連接錢包",
    },
    {
      id: "funding",
      label: "錢包資金",
      explanation: !input.walletConnected || input.walletAddressKnown === false
        ? "需要連接用戶自己的錢包；平台不託管資金。"
        : input.balanceAllowanceReady === false
        ? "錢包資金或授權狀態未準備好。"
        : input.walletFundsSufficient === false
        ? "錢包資金不足；可透過第三方服務為自己的錢包增值。"
        : input.fundingAvailable === false
          ? "錢包增值服務暫時不可用。"
          : "可為用戶自己的錢包增值；平台不託管資金。",
      status: !input.walletConnected || input.walletAddressKnown === false || input.balanceAllowanceReady === false || input.walletFundsSufficient === false || input.fundingAvailable === false ? "missing" : "complete",
      actionHref: !input.walletConnected || input.walletAddressKnown === false || input.balanceAllowanceReady === false || input.walletFundsSufficient === false || input.fundingAvailable === false ? "/account" : undefined,
      actionLabel: !input.walletConnected || input.walletAddressKnown === false ? "查看錢包狀態" : input.balanceAllowanceReady === false || input.walletFundsSufficient === false || input.fundingAvailable === false ? "增值錢包" : undefined,
    },
    {
      id: "credentials",
      label: "Polymarket 交易權限",
      explanation: input.hasCredentials
        ? "Polymarket 交易權限已準備好。"
        : "需要先用你的錢包設定 Polymarket 交易權限。平台不會取得你的私鑰，亦不會代你下注或交易。",
      status: input.hasCredentials ? "complete" : "missing",
      actionLabel: input.hasCredentials ? undefined : "設定 Polymarket 交易權限",
    },
    {
      id: "signature",
      label: "用戶自行簽署",
      explanation: input.userSigningAvailable === false || !input.userSigned ? "訂單提交前必須由用戶錢包簽署。" : "訂單已由用戶錢包簽署。",
      status: input.userSigningAvailable === false || !input.userSigned ? "missing" : "complete",
      actionLabel: input.userSigningAvailable === false || !input.userSigned ? "準備自行簽署訂單" : undefined,
    },
    {
      id: "builder_code",
      label: "Builder Code",
      explanation: input.hasBuilderCode ? "Builder Code 已設定。" : "Builder Code 未設定；只影響下單，不影響瀏覽市場。",
      status: input.hasBuilderCode ? "complete" : "missing",
    },
    {
      id: "trading_feature",
      label: "交易介面",
      explanation: input.featureEnabled ? "交易介面已顯示；路由交易功能已啟用。" : "交易介面已顯示；實盤提交尚未啟用。",
      status: "complete",
    },
    {
      id: "market_status",
      label: input.marketTradable && (input.featureEnabled === false || input.submitModeEnabled === false || !input.submitterAvailable || input.submitterEndpointAvailable === false) ? "交易狀態" : "市場狀態",
      explanation: !input.marketTradable
        ? input.marketTradabilityReason ?? `${input.marketTradabilityLabel ?? "此市場"}，目前只供瀏覽。`
        : input.featureEnabled === false || input.submitModeEnabled === false || !input.submitterAvailable || input.submitterEndpointAvailable === false
          ? "目前只提供市場瀏覽及訂單預覽。"
          : "市場可交易。",
      status: input.marketTradable ? (input.featureEnabled === false || input.submitModeEnabled === false || !input.submitterAvailable || input.submitterEndpointAvailable === false ? "disabled" : "complete") : "unavailable",
      actionLabel: !input.marketTradable
        ? input.marketTradabilityLabel ?? "市場只供瀏覽"
        : input.featureEnabled === false || input.submitModeEnabled === false || !input.submitterAvailable || input.submitterEndpointAvailable === false
          ? "實盤提交已停用"
          : undefined,
    },
    {
      id: "order_values",
      label: "價格及數量",
      explanation: input.orderValid === false ? "請輸入有效價格及數量。" : "價格及數量格式有效。",
      status: input.orderValid === false ? "missing" : "complete",
    },
    {
      id: "submitter",
      label: "實盤提交器",
      explanation: input.submitModeEnabled === true && input.submitterAvailable && input.submitterEndpointAvailable !== false ? "實盤提交器已啟用。" : "實盤提交暫未啟用。",
      status: input.submitModeEnabled === true && input.submitterAvailable && input.submitterEndpointAvailable !== false ? "complete" : "disabled",
    },
  ];
};
