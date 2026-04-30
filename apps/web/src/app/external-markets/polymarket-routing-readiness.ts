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

export type PolymarketReadinessChecklistStatus = "complete" | "missing" | "blocked" | "checking";

export interface PolymarketReadinessChecklistItem {
  id:
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
  fundingAvailable?: boolean;
  walletFundsSufficient?: boolean;
  geoblockAllowed?: boolean;
  geoblockStatus?: PolymarketGeoblockStatus;
  hasCredentials: boolean;
  userSigningAvailable?: boolean;
  marketTradable: boolean;
  orderValid?: boolean;
  submitterAvailable: boolean;
  userSigned?: boolean;
  submitted?: boolean;
  balanceAllowanceReady?: boolean;
  attributionRecordingReady?: boolean;
}

const tradingDisabledReasonZh: Record<PolymarketTradingReadinessCheck, string> = {
  routedTradingEnabled: "交易介面預覽",
  betaUserAllowlisted: "測試交易功能只限指定用戶",
  builderCodeConfigured: "Builder Code 未設定",
  walletConnected: "尚未連接錢包",
  polymarketCredentialsReady: "設定 Polymarket 憑證",
  userCanSignOrder: "需要用戶自行簽署訂單",
  marketTradable: "市場暫時不可交易",
  balanceAllowanceReady: "餘額或授權不足",
  submitterReady: "實盤提交已停用",
  attributionRecordingReady: "交易提交器未準備好",
};

export const getPolymarketTradingReadiness = (
  input: PolymarketRoutingReadinessInput,
): PolymarketTradingReadiness => {
  const checks: Record<PolymarketTradingReadinessCheck, boolean> = {
    routedTradingEnabled: input.featureEnabled,
    betaUserAllowlisted: input.betaUserAllowlisted !== false,
    builderCodeConfigured: input.hasBuilderCode,
    walletConnected: input.walletConnected && input.walletAddressKnown !== false,
    polymarketCredentialsReady: input.hasCredentials,
    userCanSignOrder: input.userSigningAvailable !== false && input.userSigned === true,
    marketTradable: input.marketTradable && input.orderValid !== false,
    balanceAllowanceReady: input.balanceAllowanceReady !== false && input.walletFundsSufficient !== false,
    submitterReady: input.submitModeEnabled !== false && input.submitterAvailable,
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
  if (!input.featureEnabled) return "feature_disabled";
  if (input.betaUserAllowlisted === false) return "beta_user_not_allowlisted";
  if (!input.walletConnected) return "wallet_not_connected";
  if (input.walletAddressKnown === false) return "wallet_not_connected";
  if (input.walletFundsSufficient === false) return "wallet_funds_insufficient";
  if (!input.hasCredentials) return "credentials_missing";
  if (input.userSigningAvailable === false) return "signature_required";
  if (!input.hasBuilderCode) return "builder_code_missing";
  if (!input.marketTradable) return "market_not_tradable";
  if (input.orderValid === false) return "invalid_order";
  if (input.submitModeEnabled === false) return "submit_mode_disabled";
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
  if (input.betaUserAllowlisted === false) reasons.push("beta_user_not_allowlisted");
  if (!input.walletConnected) reasons.push("wallet_not_connected");
  if (input.walletConnected && input.walletAddressKnown === false) reasons.push("wallet_not_connected");
  if (input.walletFundsSufficient === false) reasons.push("wallet_funds_insufficient");
  if (!input.hasCredentials) reasons.push("credentials_missing");
  if (input.userSigningAvailable === false) reasons.push("signature_required");
  if (!input.hasBuilderCode) reasons.push("builder_code_missing");
  if (!input.marketTradable) reasons.push("market_not_tradable");
  if (input.orderValid === false) reasons.push("invalid_order");
  if (input.submitModeEnabled === false) reasons.push("submit_mode_disabled");
  if (!input.submitterAvailable) reasons.push("submitter_unavailable");

  return reasons;
};

export const isPolymarketRoutingFullyEnabled = (input: PolymarketRoutingReadinessInput): boolean =>
  getPolymarketRoutingReadiness({ ...input, userSigned: true }) === "ready_to_submit";

export const getPolymarketTopBlockingReason = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness | null => {
  if (!input.walletConnected || input.walletAddressKnown === false) return "wallet_not_connected";
  if (!input.hasCredentials) return "credentials_missing";
  if (!input.marketTradable || input.orderValid === false) return "market_not_tradable";
  if (input.submitModeEnabled === false) return "submit_mode_disabled";
  if (!input.submitterAvailable) return "submitter_unavailable";
  if (!input.featureEnabled) return "feature_disabled";
  if (input.betaUserAllowlisted === false) return "beta_user_not_allowlisted";
  if (!input.hasBuilderCode) return "builder_code_missing";
  if (input.walletFundsSufficient === false) return "wallet_funds_insufficient";
  if (input.userSigningAvailable === false || !input.userSigned) return "signature_required";
  if (input.submitted) return null;
  return null;
};

export const getPolymarketGeoblockStatusLabel = (_status: PolymarketGeoblockStatus): string => "所在地區由 Polymarket 判斷";

export const getPolymarketReadinessChecklist = (
  input: PolymarketRoutingReadinessInput,
): PolymarketReadinessChecklistItem[] => {
  return [
    {
      id: "funding",
      label: "錢包資金 / 增值",
      explanation: !input.walletConnected || input.walletAddressKnown === false
        ? "需要連接用戶自己的錢包；平台不託管資金。"
        : input.walletFundsSufficient === false
        ? "錢包資金不足；可透過第三方服務為自己的錢包增值。"
        : input.fundingAvailable === false
          ? "錢包增值服務暫時不可用。"
          : "可為用戶自己的錢包增值；平台不託管資金。",
      status: !input.walletConnected || input.walletAddressKnown === false || input.walletFundsSufficient === false || input.fundingAvailable === false ? "missing" : "complete",
      actionHref: !input.walletConnected || input.walletAddressKnown === false || input.walletFundsSufficient === false || input.fundingAvailable === false ? "/account" : undefined,
      actionLabel: !input.walletConnected || input.walletAddressKnown === false ? "查看錢包狀態" : input.walletFundsSufficient === false || input.fundingAvailable === false ? "增值錢包" : undefined,
    },
    {
      id: "credentials",
      label: "Polymarket 憑證",
      explanation: input.hasCredentials ? "已偵測到用戶 Polymarket 憑證。" : "需要用戶自己的 Polymarket L2 憑證。",
      status: input.hasCredentials ? "complete" : "missing",
      actionHref: input.hasCredentials ? undefined : "/account",
      actionLabel: input.hasCredentials ? undefined : "設定憑證",
    },
    {
      id: "signature",
      label: "用戶自行簽署",
      explanation: input.userSigningAvailable === false || !input.userSigned ? "訂單提交前必須由用戶錢包簽署。" : "用戶簽署流程已準備。",
      status: input.userSigningAvailable === false || !input.userSigned ? "missing" : "complete",
    },
    {
      id: "builder_code",
      label: "Builder Code",
      explanation: input.hasBuilderCode ? "Builder Code 已設定。" : "Builder Code 未設定；只影響下單，不影響瀏覽市場。",
      status: input.hasBuilderCode ? "complete" : "missing",
    },
    {
      id: "trading_feature",
      label: "交易功能",
      explanation: input.featureEnabled ? "交易介面預覽可用；實盤提交需另行啟用。" : "交易介面預覽；市場仍可瀏覽。",
      status: input.featureEnabled ? "complete" : "blocked",
    },
    {
      id: "market_status",
      label: "市場狀態",
      explanation: input.marketTradable ? "市場目前可交易。" : "市場暫時不可交易。",
      status: input.marketTradable ? "complete" : "blocked",
    },
    {
      id: "order_values",
      label: "價格及數量",
      explanation: input.orderValid === false ? "請輸入有效價格及數量。" : "價格及數量格式有效。",
      status: input.orderValid === false ? "missing" : "complete",
    },
    {
      id: "submitter",
      label: "提交器",
      explanation: input.submitModeEnabled === false ? "實盤提交已停用。" : !input.submitterAvailable ? "交易提交器未準備好。" : "交易提交器已準備接收用戶簽署訂單。",
      status: input.submitModeEnabled === false || !input.submitterAvailable ? "blocked" : "complete",
    },
  ];
};
