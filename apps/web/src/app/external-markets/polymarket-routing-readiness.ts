export type PolymarketRoutingReadiness =
  | "auth_required"
  | "submit_mode_disabled"
  | "builder_code_missing"
  | "feature_disabled"
  | "wallet_not_connected"
  | "geoblock_checking"
  | "geoblock_unconfirmed"
  | "geoblocked"
  | "credentials_missing"
  | "market_not_tradable"
  | "invalid_order"
  | "submitter_unavailable"
  | "signature_required"
  | "ready_to_submit"
  | "submitted";

export type PolymarketGeoblockStatus = "unknown" | "checking" | "allowed" | "blocked" | "error" | "stale";

export type PolymarketReadinessChecklistStatus = "complete" | "missing" | "blocked" | "checking";

export interface PolymarketReadinessChecklistItem {
  id:
    | "login"
    | "wallet"
    | "region"
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
  submitModeEnabled?: boolean;
  walletConnected: boolean;
  geoblockAllowed?: boolean;
  geoblockStatus?: PolymarketGeoblockStatus;
  hasCredentials: boolean;
  userSigningAvailable?: boolean;
  marketTradable: boolean;
  orderValid?: boolean;
  submitterAvailable: boolean;
  userSigned?: boolean;
  submitted?: boolean;
}

const resolveGeoblockStatus = (input: PolymarketRoutingReadinessInput): PolymarketGeoblockStatus | undefined => {
  if (input.geoblockStatus) return input.geoblockStatus;
  if (input.geoblockAllowed === true) return "allowed";
  if (input.geoblockAllowed === false) return "blocked";
  return undefined;
};

const getGeoblockReadiness = (
  input: PolymarketRoutingReadinessInput,
): Extract<PolymarketRoutingReadiness, "geoblock_checking" | "geoblock_unconfirmed" | "geoblocked"> | null => {
  const status = resolveGeoblockStatus(input);

  if (status === "blocked") return "geoblocked";
  if (status === "unknown" || status === "checking") return "geoblock_checking";
  if (status === "error" || status === "stale") return "geoblock_unconfirmed";
  return null;
};

export const getPolymarketRoutingReadiness = (
  input: PolymarketRoutingReadinessInput,
): PolymarketRoutingReadiness => {
  if (!input.featureEnabled) return "feature_disabled";
  if (input.loggedIn === false) return "auth_required";
  if (!input.walletConnected) return "wallet_not_connected";
  const geoblockReadiness = getGeoblockReadiness(input);
  if (geoblockReadiness) return geoblockReadiness;
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
  const geoblockReadiness = getGeoblockReadiness(input);

  if (!input.featureEnabled) reasons.push("feature_disabled");
  if (input.loggedIn === false) reasons.push("auth_required");
  if (!input.walletConnected) reasons.push("wallet_not_connected");
  if (geoblockReadiness) reasons.push(geoblockReadiness);
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
  if (!input.featureEnabled) {
    return "feature_disabled";
  }

  const readiness = getPolymarketRoutingReadiness(input);
  return readiness === "ready_to_submit" || readiness === "submitted" ? null : readiness;
};

export const getPolymarketGeoblockStatusLabel = (status: PolymarketGeoblockStatus): string => {
  if (status === "allowed") return "所在地區支援狀態已確認";
  if (status === "blocked") return "你目前所在地區暫不支援 Polymarket 下單";
  if (status === "error" || status === "stale") return "暫時未能確認所在地區支援狀態";
  return "正在檢查所在地區支援狀態";
};

export const getPolymarketReadinessChecklist = (
  input: PolymarketRoutingReadinessInput,
): PolymarketReadinessChecklistItem[] => {
  const geoblockStatus = resolveGeoblockStatus(input) ?? "unknown";
  const regionStatus: PolymarketReadinessChecklistStatus =
    geoblockStatus === "allowed"
      ? "complete"
      : geoblockStatus === "blocked"
        ? "blocked"
        : geoblockStatus === "error" || geoblockStatus === "stale"
          ? "missing"
          : "checking";

  return [
    {
      id: "login",
      label: "登入",
      explanation: input.loggedIn === false ? "登入後才可準備用戶簽署訂單。" : "已確認登入狀態。",
      status: input.loggedIn === false ? "missing" : "complete",
      actionHref: input.loggedIn === false ? "/login" : undefined,
      actionLabel: input.loggedIn === false ? "登入" : undefined,
    },
    {
      id: "wallet",
      label: "連接錢包",
      explanation: input.walletConnected ? "錢包已連接，可由用戶自行簽署。" : "需要連接用戶自己的錢包。",
      status: input.walletConnected ? "complete" : "missing",
      actionHref: input.walletConnected ? undefined : "/account",
      actionLabel: input.walletConnected ? undefined : "查看錢包狀態",
    },
    {
      id: "region",
      label: "所在地區支援",
      explanation: getPolymarketGeoblockStatusLabel(geoblockStatus),
      status: regionStatus,
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
      explanation: input.featureEnabled ? "路由交易功能已啟用。" : "交易功能尚未啟用，市場仍可瀏覽。",
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
      explanation: input.submitModeEnabled === false || !input.submitterAvailable ? "提交器暫時不可用。" : "提交器已準備接收用戶簽署訂單。",
      status: input.submitModeEnabled === false || !input.submitterAvailable ? "blocked" : "complete",
    },
  ];
};
