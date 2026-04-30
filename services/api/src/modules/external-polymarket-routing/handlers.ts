import { readBooleanFlag } from "@bet/config";
import { createDatabaseClient } from "@bet/db";
import {
  assertPolymarketBuilderConfigured,
  getPolymarketBuilderCode,
  PolymarketBuilderConfigurationError,
} from "@bet/integrations";
import { incrementCounter, logger } from "@bet/observability";

import { getExternalMarketRecord, type ExternalMarketView } from "../external-markets/repository";
import { getLinkedWalletForUser, type LinkedWallet } from "../wallets/repository";
import { lookupUserPolymarketL2Credentials } from "./l2-credentials";
import {
  createPolymarketOrderSubmitterFromEnv,
  PolymarketSubmitterError,
  type PolymarketL2Credentials,
  type PolymarketMarketConstraints,
  type PolymarketOrderSubmitterResponse,
} from "./submitter";

export type PolymarketL2CredentialStatus = "present" | "missing" | "revoked";
export type ExternalPolymarketOrderSide = "BUY" | "SELL";
export type ExternalPolymarketOrderType = "GTC" | "GTD" | "FOK" | "FAK";
export type ExternalPolymarketCanaryReadinessState =
  | "routed_trading_disabled"
  | "canary_not_allowed"
  | "beta_user_not_allowlisted"
  | "region_blocked"
  | "region_unknown"
  | "wallet_not_connected"
  | "wallet_not_verified"
  | "polymarket_l2_credentials_missing"
  | "user_signature_required"
  | "market_not_tradable"
  | "market_stale"
  | "token_missing"
  | "price_invalid"
  | "size_invalid"
  | "insufficient_balance"
  | "insufficient_allowance"
  | "builder_code_missing"
  | "submitter_unavailable"
  | "ready_for_user_signature"
  | "ready_to_submit_signed_order";

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

export interface ExternalPolymarketUserAuthBoundary {
  userId: string;
  userWalletAddress: string;
  linkedWalletAddress: string;
  l2CredentialStatus: PolymarketL2CredentialStatus;
}

export interface ExternalPolymarketUserConfirmation {
  side: ExternalPolymarketOrderSide;
  tokenID: string;
  outcomeExternalId: string;
  price: number;
  size?: number;
  amount?: number;
  orderType: ExternalPolymarketOrderType;
  expiration: number;
  builderCode: string;
  builderFeeAcknowledged: boolean;
  confirmedAt: string;
}

export interface ExternalPolymarketGeoblockProof {
  blocked: false;
  checkedAt: string;
  country?: string | null;
  region?: string | null;
}

export type ExternalPolymarketServerRegionStatus = "allowed" | "blocked" | "unknown";

export interface ExternalPolymarketServerRegionCheck {
  status: ExternalPolymarketServerRegionStatus;
  country?: string | null;
  region?: string | null;
  checkedAt: string;
}

export interface ExternalPolymarketOrderRouteInput {
  userWalletAddress?: unknown;
  marketSource?: unknown;
  marketExternalId?: unknown;
  outcomeExternalId?: unknown;
  geoblock?: unknown;
  orderInput?: unknown;
  signedOrder?: unknown;
  orderType?: unknown;
  userConfirmation?: unknown;
}

export interface ExternalPolymarketOrderRoutePayload {
  userId: string;
  userWalletAddress: string;
  linkedWalletAddress: string;
  l2CredentialStatus: "present";
  l2Credentials: PolymarketL2Credentials;
  market: ExternalMarketView;
  constraints: PolymarketMarketConstraints;
  geoblock: ExternalPolymarketGeoblockProof;
  orderInput: Record<string, unknown> & { builderCode: string };
  signedOrder: Record<string, unknown> & {
    maker: string;
    signer: string;
    tokenId: string;
    side: ExternalPolymarketOrderSide;
    signatureType: number;
    timestamp: string;
    expiration: string;
    builder: string;
    signature: string;
  };
  orderType: ExternalPolymarketOrderType;
  userConfirmation: ExternalPolymarketUserConfirmation;
}

export interface ExternalPolymarketOrderRouteResult {
  status: "submitted";
  attribution: {
    builderCodeAttached: true;
    builderCode: string;
    attachedBeforeUserSignature: true;
  };
  upstream: PolymarketOrderSubmitterResponse;
}

export interface PolymarketOrderSubmitter {
  readonly mode: "disabled" | "real";
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
  getMarketConstraints(conditionId: string, tokenId: string): Promise<PolymarketMarketConstraints>;
  checkBalanceAllowance?(payload: ExternalPolymarketOrderRoutePayload): Promise<{ balanceSufficient: boolean; allowanceSufficient: boolean }>;
  submitOrder(payload: ExternalPolymarketOrderRoutePayload): Promise<PolymarketOrderSubmitterResponse>;
}

export interface ExternalPolymarketOrderRouteDependencies {
  requestUserId?: string;
  requestUserEmail?: string | null;
  submitter?: PolymarketOrderSubmitter;
  linkedWalletLookup?: (userId: string) => Promise<(Pick<LinkedWallet, "walletAddress"> & { verifiedAt?: string | null }) | null>;
  l2CredentialLookup?: (
    userId: string,
    walletAddress: string,
  ) => Promise<L2CredentialLookupResult>;
  signatureVerifier?: (payload: {
    signedOrder: ExternalPolymarketOrderRoutePayload["signedOrder"];
    expectedSigner: string;
    builderCode: string;
  }) => Promise<boolean>;
  geoblockProofVerifier?: (proof: ExternalPolymarketGeoblockProof) => Promise<boolean>;
  auditRecorder?: (payload: ExternalPolymarketOrderRoutePayload, upstream: PolymarketOrderSubmitterResponse) => Promise<void>;
  routedOrderAttemptRecorder?: (payload: ExternalPolymarketOrderRoutePayload, upstream: PolymarketOrderSubmitterResponse) => Promise<void>;
  serverRegionCheck?: ExternalPolymarketServerRegionCheck;
  balanceAllowanceLookup?: (input: {
    userId: string;
    walletAddress: string;
    funderAddress: string;
    tokenId: string;
    side: ExternalPolymarketOrderSide;
    price: number;
    size: number;
  }) => Promise<{ balanceSufficient: boolean; allowanceSufficient: boolean }>;
  now?: () => Date;
  allowNonProductionSubmissionForTests?: boolean;
}

type L2CredentialLookupResult = {
  status: PolymarketL2CredentialStatus;
  credentials?: PolymarketL2Credentials;
};

export class ExternalPolymarketRoutingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ExternalPolymarketRoutingError";
    this.status = status;
    this.code = code;
  }
}

const MAX_ORDER_AGE_MS = 60_000;
const MAX_CONFIRMATION_AGE_MS = 60_000;
const ALLOWED_ORDER_TYPES = new Set<ExternalPolymarketOrderType>(["GTC", "GTD", "FOK", "FAK"]);
const ALLOWED_SIGNATURE_TYPES = new Set([0, 1, 2, 3]);

const defaultLinkedWalletLookup = async (userId: string) =>
  getLinkedWalletForUser(createDatabaseClient(), userId);

const defaultL2CredentialLookup = lookupUserPolymarketL2Credentials;

const defaultGeoblockProofVerifier = async (): Promise<boolean> => false;

const normalizeAddress = (value: string): string => value.trim().toLowerCase();
const splitEnvList = (name: string): string[] =>
  (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const isGlobalRoutedTradingEnabled = (): boolean =>
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_ENABLED", { defaultValue: false });

const isBetaRoutedTradingEnabled = (): boolean =>
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_BETA_ENABLED", { defaultValue: false });

const isCanaryOnly = (): boolean => readBooleanFlag("POLYMARKET_ROUTED_TRADING_CANARY_ONLY", { defaultValue: true });
const isKillSwitchActive = (): boolean =>
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_KILL_SWITCH", { defaultValue: false }) ||
  readBooleanFlag("POLYMARKET_ORDER_SUBMIT_KILL_SWITCH", { defaultValue: false });

const isBetaAllowlisted = (input: { userId?: string; email?: string | null; walletAddress?: string | null }): boolean => {
  const allowlist = splitEnvList("POLYMARKET_ROUTED_TRADING_ALLOWLIST");
  const ids = splitEnvList("POLYMARKET_ROUTED_TRADING_CANARY_USER_IDS");
  const emails = splitEnvList("POLYMARKET_ROUTED_TRADING_CANARY_EMAILS");
  const wallets = splitEnvList("POLYMARKET_ROUTED_TRADING_CANARY_WALLETS");
  const userId = input.userId?.toLowerCase();
  const email = input.email?.toLowerCase() ?? null;
  const wallet = input.walletAddress?.toLowerCase() ?? null;
  return Boolean(
    (userId && (allowlist.includes(userId) || ids.includes(userId))) ||
    (email && (allowlist.includes(email) || emails.includes(email))) ||
    (wallet && wallets.includes(wallet)),
  );
};

const isBetaUserAllowed = (input: { userId?: string; email?: string | null; walletAddress?: string | null }): boolean =>
  isGlobalRoutedTradingEnabled() || (isBetaRoutedTradingEnabled() && isBetaAllowlisted(input));

const isRoutedTradingGateOpen = (): boolean =>
  (isGlobalRoutedTradingEnabled() || isBetaRoutedTradingEnabled()) && !isKillSwitchActive();

const isBuilderCodeSafelyConfigured = (): boolean => {
  try {
    return getPolymarketBuilderCode() !== null;
  } catch {
    return false;
  }
};

export const getPolymarketCanaryConfig = () => ({
  canaryOnly: !isGlobalRoutedTradingEnabled(),
  betaEnabled: isBetaRoutedTradingEnabled(),
  allowedUsersCount: new Set([
    ...splitEnvList("POLYMARKET_ROUTED_TRADING_ALLOWLIST"),
    ...splitEnvList("POLYMARKET_ROUTED_TRADING_CANARY_USER_IDS"),
    ...splitEnvList("POLYMARKET_ROUTED_TRADING_CANARY_EMAILS"),
    ...splitEnvList("POLYMARKET_ROUTED_TRADING_CANARY_WALLETS"),
  ]).size,
  killSwitchActive: isKillSwitchActive(),
});

const toObject = (value: unknown, label: string): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", `${label} must be an object`);
};

const toTrimmedString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", `${label} must be a non-empty string`);
  }
  return value.trim();
};

const toFiniteNumber = (value: unknown, label: string): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", `${label} must be a finite number`);
  }
  return parsed;
};

const toOptionalFiniteNumber = (value: unknown, label: string): number | undefined =>
  value === undefined || value === null ? undefined : toFiniteNumber(value, label);

const toOrderType = (value: unknown): ExternalPolymarketOrderType => {
  const orderType = toTrimmedString(value, "orderType").toUpperCase() as ExternalPolymarketOrderType;
  if (!ALLOWED_ORDER_TYPES.has(orderType)) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_ORDER_TYPE_UNSUPPORTED", "unsupported Polymarket order type");
  }
  return orderType;
};

const toSide = (value: unknown, label: string): ExternalPolymarketOrderSide => {
  const side = toTrimmedString(value, label).toUpperCase();
  if (side !== "BUY" && side !== "SELL") {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", `${label} must be BUY or SELL`);
  }
  return side;
};

const readTokenId = (orderInput: Record<string, unknown>): string =>
  toTrimmedString(orderInput.tokenID ?? orderInput.tokenId, "orderInput.tokenID");

const readSignedOrder = (
  value: unknown,
): ExternalPolymarketOrderRoutePayload["signedOrder"] => {
  const signedOrder = toObject(value, "signedOrder");
  return {
    ...signedOrder,
    maker: toTrimmedString(signedOrder.maker, "signedOrder.maker"),
    signer: toTrimmedString(signedOrder.signer, "signedOrder.signer"),
    tokenId: toTrimmedString(signedOrder.tokenId, "signedOrder.tokenId"),
    side: toSide(signedOrder.side, "signedOrder.side"),
    signatureType: toFiniteNumber(signedOrder.signatureType, "signedOrder.signatureType"),
    timestamp: toTrimmedString(signedOrder.timestamp, "signedOrder.timestamp"),
    expiration: toTrimmedString(signedOrder.expiration, "signedOrder.expiration"),
    builder: toTrimmedString(signedOrder.builder, "signedOrder.builder"),
    signature: toTrimmedString(signedOrder.signature, "signedOrder.signature"),
  };
};

const readUserConfirmation = (value: unknown): ExternalPolymarketUserConfirmation => {
  const confirmation = toObject(value, "userConfirmation");
  return {
    side: toSide(confirmation.side, "userConfirmation.side"),
    tokenID: toTrimmedString(confirmation.tokenID ?? confirmation.tokenId, "userConfirmation.tokenID"),
    outcomeExternalId: toTrimmedString(confirmation.outcomeExternalId, "userConfirmation.outcomeExternalId"),
    price: toFiniteNumber(confirmation.price, "userConfirmation.price"),
    size: toOptionalFiniteNumber(confirmation.size, "userConfirmation.size"),
    amount: toOptionalFiniteNumber(confirmation.amount, "userConfirmation.amount"),
    orderType: toOrderType(confirmation.orderType),
    expiration: toFiniteNumber(confirmation.expiration, "userConfirmation.expiration"),
    builderCode: toTrimmedString(confirmation.builderCode, "userConfirmation.builderCode"),
    builderFeeAcknowledged: confirmation.builderFeeAcknowledged === true,
    confirmedAt: toTrimmedString(confirmation.confirmedAt, "userConfirmation.confirmedAt"),
  };
};

const readGeoblockProof = (value: unknown): ExternalPolymarketGeoblockProof => {
  const geoblock = toObject(value, "geoblock");
  if (geoblock.blocked !== false) {
    throw new ExternalPolymarketRoutingError(
      403,
      "POLYMARKET_GEOBLOCK_RESTRICTED",
      "Polymarket trading is not available in the user's current region",
    );
  }

  return {
    blocked: false,
    checkedAt: toTrimmedString(geoblock.checkedAt, "geoblock.checkedAt"),
    country: typeof geoblock.country === "string" ? geoblock.country : null,
    region: typeof geoblock.region === "string" ? geoblock.region : null,
  };
};

const isProductionLikeRuntime = (): boolean => {
  const runtime = process.env.DEPLOY_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV;
  return runtime === "production" || runtime === "staging";
};

const isExternalPolymarketRoutingEnabled = isRoutedTradingGateOpen;

export const getExternalPolymarketRoutingReadiness = () => ({
  builderCodeConfigured: isBuilderCodeSafelyConfigured(),
  routedTradingEnabled: isExternalPolymarketRoutingEnabled() && !isKillSwitchActive(),
  canaryOnly: !isGlobalRoutedTradingEnabled(),
  betaEnabled: isBetaRoutedTradingEnabled(),
  killSwitchActive: isKillSwitchActive(),
  submitterMode: process.env.POLYMARKET_CLOB_SUBMITTER === "real" ? "real" : "disabled",
});

const zhReasonByCheck: Record<PolymarketTradingReadinessCheck, string> = {
  routedTradingEnabled: "交易功能尚未啟用",
  betaUserAllowlisted: "測試交易功能只限指定用戶",
  builderCodeConfigured: "Builder Code 未設定",
  walletConnected: "尚未連接錢包",
  polymarketCredentialsReady: "設定 Polymarket 憑證",
  userCanSignOrder: "需要用戶自行簽署訂單",
  marketTradable: "市場暫時不可交易",
  balanceAllowanceReady: "餘額或授權不足",
  submitterReady: "交易提交器未準備好",
  attributionRecordingReady: "交易提交器未準備好",
};

const toTradingReadiness = (checks: Record<PolymarketTradingReadinessCheck, boolean>): PolymarketTradingReadiness => {
  const missingChecks = (Object.keys(checks) as PolymarketTradingReadinessCheck[]).filter((key) => !checks[key]);
  const safeToSubmit = missingChecks.length === 0;
  return {
    enabled: safeToSubmit,
    disabledReason: safeToSubmit ? "透過 Polymarket 交易" : zhReasonByCheck[missingChecks[0] ?? "routedTradingEnabled"],
    missingChecks,
    safeToSubmit,
  };
};

export interface ExternalPolymarketOrderReadinessResult {
  ok: boolean;
  state: ExternalPolymarketCanaryReadinessState;
  disabledReasons: ExternalPolymarketCanaryReadinessState[];
  canaryOnly: boolean;
  canaryAllowed: boolean;
  routedTradingEnabled: boolean;
  killSwitchActive: boolean;
  builderCodeConfigured: boolean;
  submitterMode: "disabled" | "real";
  submitterAvailable: boolean;
  region: ExternalPolymarketServerRegionCheck;
  market: { externalId: string; title: string; status: string; stale: boolean } | null;
  order: {
    tokenId: string | null;
    outcomeExternalId: string | null;
    side: ExternalPolymarketOrderSide | null;
    price: number | null;
    size: number | null;
    estimatedNotional: number | null;
  };
  feeDisclosure: {
    builderMakerFeeBps: number;
    builderTakerFeeBps: number;
    estimatedBuilderFee: number | null;
    estimatedPlatformFee: number | null;
    maxCost: number | null;
  };
  warnings: string[];
  checkedAt: string;
  readiness: PolymarketTradingReadiness;
}

const defaultServerRegionCheck = (now: Date): ExternalPolymarketServerRegionCheck => ({
  status: "unknown",
  country: null,
  region: null,
  checkedAt: now.toISOString(),
});

const isMarketStale = (market: ExternalMarketView, now: Date): boolean => {
  const candidate = market.lastSyncedAt ?? market.updatedAt;
  const parsed = candidate ? Date.parse(candidate) : Number.NaN;
  return !Number.isFinite(parsed) || now.getTime() - parsed > 5 * 60_000;
};

const appendReason = (
  reasons: ExternalPolymarketCanaryReadinessState[],
  reason: ExternalPolymarketCanaryReadinessState,
): void => {
  if (!reasons.includes(reason)) reasons.push(reason);
};

const safeOptionalNumber = (value: unknown): number | null => {
  try {
    return toOptionalFiniteNumber(value, "value") ?? null;
  } catch {
    return null;
  }
};

export const evaluateExternalPolymarketOrderReadiness = async (
  input: ExternalPolymarketOrderRouteInput,
  dependencies: ExternalPolymarketOrderRouteDependencies = {},
): Promise<ExternalPolymarketOrderReadinessResult> => {
  const now = dependencies.now?.() ?? new Date();
  const checkedAt = now.toISOString();
  const reasons: ExternalPolymarketCanaryReadinessState[] = [];
  const readiness = getExternalPolymarketRoutingReadiness();
  const submitter = getSubmitter(dependencies);
  const region = dependencies.serverRegionCheck ?? defaultServerRegionCheck(now);
  const warnings = [
    "user_must_sign_order_payload",
    "non_custodial_polymarket_funds",
    "platform_does_not_place_user_trades_with_platform_credentials",
  ];
  const marketSource = typeof input.marketSource === "string" ? input.marketSource : "";
  const marketExternalId = typeof input.marketExternalId === "string" ? input.marketExternalId : "";
  const outcomeExternalId = typeof input.outcomeExternalId === "string" ? input.outcomeExternalId.trim() : "";
  const rawOrderInput = input.orderInput && typeof input.orderInput === "object" && !Array.isArray(input.orderInput)
    ? input.orderInput as Record<string, unknown>
    : {};
  const tokenId = typeof (rawOrderInput.tokenID ?? rawOrderInput.tokenId) === "string"
    ? String(rawOrderInput.tokenID ?? rawOrderInput.tokenId).trim()
    : typeof input.signedOrder === "object" && input.signedOrder && "tokenId" in input.signedOrder
      ? String((input.signedOrder as Record<string, unknown>).tokenId ?? "").trim()
      : null;
  const side = (() => {
    try {
      return toSide(rawOrderInput.side, "orderInput.side");
    } catch {
      return null;
    }
  })();
  const price = safeOptionalNumber(rawOrderInput.price);
  const size = safeOptionalNumber(rawOrderInput.size ?? rawOrderInput.amount);
  const estimatedNotional = price !== null && size !== null ? price * size : null;
  const userId = dependencies.requestUserId;

  if (!readiness.routedTradingEnabled) appendReason(reasons, "routed_trading_disabled");
  if (!readiness.builderCodeConfigured) appendReason(reasons, "builder_code_missing");
  if (submitter.mode !== "real") appendReason(reasons, "submitter_unavailable");
  if (region.status === "blocked") appendReason(reasons, "region_blocked");
  if (region.status === "unknown") appendReason(reasons, "region_unknown");

  const linkedWallet = userId ? await (dependencies.linkedWalletLookup ?? defaultLinkedWalletLookup)(userId) : null;
  const linkedWalletAddress = linkedWallet?.walletAddress
    ? normalizeAddress(linkedWallet.walletAddress)
    : typeof input.userWalletAddress === "string" && input.userWalletAddress.trim()
      ? normalizeAddress(input.userWalletAddress)
      : null;
  const requestedWalletAddress = typeof input.userWalletAddress === "string" && input.userWalletAddress.trim()
    ? normalizeAddress(input.userWalletAddress)
    : linkedWalletAddress;
  const betaUserAllowlisted = isBetaUserAllowed({
    userId,
    email: dependencies.requestUserEmail,
    walletAddress: requestedWalletAddress,
  });
  if (!betaUserAllowlisted) appendReason(reasons, "beta_user_not_allowlisted");
  if (!linkedWalletAddress) appendReason(reasons, "wallet_not_connected");
  if (linkedWallet && "verifiedAt" in linkedWallet && !linkedWallet.verifiedAt) appendReason(reasons, "wallet_not_verified");

  const l2Lookup = userId && linkedWalletAddress
    ? await (dependencies.l2CredentialLookup ?? defaultL2CredentialLookup)(userId, linkedWalletAddress)
    : { status: "missing" as const };
  if (l2Lookup.status !== "present") appendReason(reasons, "polymarket_l2_credentials_missing");
  if (!input.signedOrder) appendReason(reasons, "user_signature_required");

  const market = marketSource && marketExternalId ? await getExternalMarketRecord(marketSource, marketExternalId) : null;
  const stale = market ? isMarketStale(market, now) : false;
  if (!market || market.source !== "polymarket" || market.status !== "open" || market.resolvedAt || (market.closeTime && Date.parse(market.closeTime) <= now.getTime())) {
    appendReason(reasons, "market_not_tradable");
  }
  if (stale) appendReason(reasons, "market_stale");
  if (!tokenId || !outcomeExternalId || !market?.outcomes.some((outcome) => outcome.externalOutcomeId === outcomeExternalId && outcome.externalOutcomeId === tokenId)) {
    appendReason(reasons, "token_missing");
  }
  if (price === null || price <= 0 || price >= 1) appendReason(reasons, "price_invalid");
  if (size === null || size <= 0) appendReason(reasons, "size_invalid");

  if (userId && linkedWalletAddress && tokenId && side && price !== null && size !== null && dependencies.balanceAllowanceLookup) {
    const balance = await dependencies.balanceAllowanceLookup({ userId, walletAddress: linkedWalletAddress, funderAddress: linkedWalletAddress, tokenId, side, price, size });
    if (!balance.balanceSufficient) appendReason(reasons, "insufficient_balance");
    if (!balance.allowanceSufficient) appendReason(reasons, "insufficient_allowance");
  } else if (!dependencies.allowNonProductionSubmissionForTests) {
    appendReason(reasons, "insufficient_balance");
    appendReason(reasons, "insufficient_allowance");
  }

  const attributionRecordingReady = process.env.POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED !== "true";
  if (!attributionRecordingReady) appendReason(reasons, "submitter_unavailable");
  const submitterAvailable = !reasons.includes("submitter_unavailable");
  const readyWithoutSignature = reasons.length === 1 && reasons[0] === "user_signature_required";
  const state: ExternalPolymarketCanaryReadinessState = reasons.length === 0
    ? "ready_to_submit_signed_order"
    : readyWithoutSignature
      ? "ready_for_user_signature"
      : reasons[0] ?? "routed_trading_disabled";

  const readinessObject = toTradingReadiness({
    routedTradingEnabled: readiness.routedTradingEnabled,
    betaUserAllowlisted,
    builderCodeConfigured: readiness.builderCodeConfigured,
    walletConnected: Boolean(linkedWalletAddress),
    polymarketCredentialsReady: l2Lookup.status === "present",
    userCanSignOrder: Boolean(input.signedOrder),
    marketTradable: !reasons.includes("market_not_tradable") && !reasons.includes("market_stale") && !reasons.includes("token_missing") && !reasons.includes("price_invalid") && !reasons.includes("size_invalid"),
    balanceAllowanceReady: !reasons.includes("insufficient_balance") && !reasons.includes("insufficient_allowance"),
    submitterReady: submitter.mode === "real",
    attributionRecordingReady,
  });

  return {
    ok: state === "ready_for_user_signature" || state === "ready_to_submit_signed_order",
    state,
    disabledReasons: reasons,
    canaryOnly: readiness.canaryOnly,
    canaryAllowed: betaUserAllowlisted,
    routedTradingEnabled: readiness.routedTradingEnabled,
    killSwitchActive: readiness.killSwitchActive,
    builderCodeConfigured: readiness.builderCodeConfigured,
    submitterMode: readiness.submitterMode === "real" ? "real" : "disabled",
    submitterAvailable,
    region,
    market: market ? { externalId: market.externalId, title: market.title, status: market.status, stale } : null,
    order: { tokenId, outcomeExternalId: outcomeExternalId || null, side, price, size, estimatedNotional },
    feeDisclosure: {
      builderMakerFeeBps: Number(process.env.POLYMARKET_BUILDER_MAKER_FEE_BPS ?? 50),
      builderTakerFeeBps: Number(process.env.POLYMARKET_BUILDER_TAKER_FEE_BPS ?? 100),
      estimatedBuilderFee: estimatedNotional === null ? null : estimatedNotional * Number(process.env.POLYMARKET_BUILDER_TAKER_FEE_BPS ?? 100) / 10_000,
      estimatedPlatformFee: null,
      maxCost: side === "SELL" || estimatedNotional === null ? null : estimatedNotional + (estimatedNotional * Number(process.env.POLYMARKET_BUILDER_TAKER_FEE_BPS ?? 100) / 10_000),
    },
    warnings,
    checkedAt,
    readiness: readinessObject,
  };
};

export const previewExternalPolymarketOrder = async (
  input: ExternalPolymarketOrderRouteInput,
  dependencies: ExternalPolymarketOrderRouteDependencies = {},
) => {
  const readiness = await evaluateExternalPolymarketOrderReadiness(input, dependencies);
  return {
    ok: readiness.ok,
    readiness,
    marketTitle: readiness.market?.title ?? null,
    outcome: readiness.order.outcomeExternalId,
    side: readiness.order.side,
    price: readiness.order.price,
    size: readiness.order.size,
    estimatedNotional: readiness.order.estimatedNotional,
    estimatedBuilderFee: readiness.feeDisclosure.estimatedBuilderFee,
    estimatedPlatformPolymarketFee: readiness.feeDisclosure.estimatedPlatformFee,
    maxCostOrProceedsEstimate: readiness.feeDisclosure.maxCost,
    userMustSignWarning: "用戶自行簽署訂單",
    nonCustodialWarning: "本平台不託管用戶在 Polymarket 的資金",
    platformNoTradeWarning: "本平台不會代用戶下注或交易",
    disabledReason: readiness.state.startsWith("ready_") ? null : readiness.state,
  };
};

const assertRecentIso = (value: string, label: string, maxAgeMs: number, now: Date): void => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", `${label} must be an ISO timestamp`);
  }
  if (parsed > now.getTime() + 5_000 || now.getTime() - parsed > maxAgeMs) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_ORDER_STALE", "Polymarket order confirmation is stale");
  }
};

const recordRoutedOrderAudit = async (
  payload: ExternalPolymarketOrderRoutePayload,
  upstream: PolymarketOrderSubmitterResponse,
): Promise<void> => {
  const db = createDatabaseClient();
  const notional = Math.round((payload.userConfirmation.price * (payload.userConfirmation.size ?? payload.userConfirmation.amount ?? 0)) * 1_000_000);
  const [referral] = await db.query<{ id: string }>(
    `select id from public.referral_attributions where referred_user_id = $1::uuid limit 1`,
    [payload.userId],
  );

  await db.query(
    `insert into public.polymarket_routed_order_audits (
       user_id, market_external_id, market_slug, token_id, side, price, size, notional_usdc_atoms,
       builder_code_attached, polymarket_order_id, referral_attribution_id, raw_response, created_at
     ) values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::bigint, $9, $10, $11::uuid, $12::jsonb, now())`,
    [
      payload.userId,
      payload.market.externalId,
      payload.market.slug,
      payload.userConfirmation.tokenID,
      payload.userConfirmation.side,
      payload.userConfirmation.price,
      payload.userConfirmation.size ?? payload.userConfirmation.amount ?? 0,
      String(notional),
      payload.orderInput.builderCode === payload.signedOrder.builder,
      upstream.orderId,
      referral?.id ?? null,
      JSON.stringify({
        status: upstream.status,
        success: upstream.success,
        orderId: upstream.orderId,
        transactionHashCount: upstream.transactionHashes.length,
        takingAmount: upstream.takingAmount,
        makingAmount: upstream.makingAmount,
      }),
    ],
  );
};

const assertRecentOrderTimestamp = (timestamp: string, now: Date): void => {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", "signedOrder.timestamp must be numeric milliseconds");
  }
  if (parsed > now.getTime() + 5_000 || now.getTime() - parsed > MAX_ORDER_AGE_MS) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_ORDER_STALE", "Polymarket signed order is stale");
  }
};

const assertTickAligned = (price: number, tickSize: string): void => {
  const tick = Number(tickSize);
  if (!Number.isFinite(tick) || tick <= 0) {
    throw new ExternalPolymarketRoutingError(503, "POLYMARKET_CONSTRAINTS_UNAVAILABLE", "invalid upstream tick size");
  }
  const units = price / tick;
  if (Math.abs(units - Math.round(units)) > 1e-8) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_PRICE_TICK_INVALID", "price is not aligned to Polymarket tick size");
  }
};

const assertOrderMatchesConfirmation = (input: {
  orderInput: Record<string, unknown>;
  signedOrder: ExternalPolymarketOrderRoutePayload["signedOrder"];
  confirmation: ExternalPolymarketUserConfirmation;
  orderType: ExternalPolymarketOrderType;
  builderCode: string;
}): void => {
  const tokenId = readTokenId(input.orderInput);
  const orderSide = toSide(input.orderInput.side, "orderInput.side");
  const price = toFiniteNumber(input.orderInput.price, "orderInput.price");
  const size = toOptionalFiniteNumber(input.orderInput.size, "orderInput.size");
  const amount = toOptionalFiniteNumber(input.orderInput.amount, "orderInput.amount");
  const expiration = toFiniteNumber(input.orderInput.expiration ?? input.signedOrder.expiration, "orderInput.expiration");
  const builderCode = toTrimmedString(input.orderInput.builderCode, "orderInput.builderCode");

  if (builderCode !== input.builderCode || input.signedOrder.builder !== input.builderCode) {
    throw new ExternalPolymarketRoutingError(
      400,
      "POLYMARKET_BUILDER_CODE_NOT_SIGNED",
      "builderCode must be present before user signing and match the signed V2 order builder field",
    );
  }
  if (input.confirmation.builderCode !== input.builderCode || !input.confirmation.builderFeeAcknowledged) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_BUILDER_FEE_NOT_CONFIRMED", "builder fee attribution must be explicitly confirmed");
  }
  if (tokenId !== input.confirmation.tokenID || tokenId !== input.signedOrder.tokenId) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_TOKEN_MISMATCH", "tokenId does not match signed order and confirmation");
  }
  if (orderSide !== input.confirmation.side || orderSide !== input.signedOrder.side) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_SIDE_MISMATCH", "side does not match signed order and confirmation");
  }
  if (price !== input.confirmation.price) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_PRICE_MISMATCH", "price does not match confirmation");
  }
  if (input.orderType !== input.confirmation.orderType) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_ORDER_TYPE_MISMATCH", "order type does not match confirmation");
  }
  if (expiration !== input.confirmation.expiration || input.signedOrder.expiration !== String(input.confirmation.expiration)) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_EXPIRATION_MISMATCH", "expiration does not match confirmation");
  }
  if (size !== input.confirmation.size || amount !== input.confirmation.amount) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_SIZE_MISMATCH", "size or amount does not match confirmation");
  }
  if (input.orderType === "FOK" || input.orderType === "FAK") {
    if (price <= 0 || price >= 1) {
      throw new ExternalPolymarketRoutingError(400, "POLYMARKET_SLIPPAGE_GUARD_MISSING", "market orders require a worst-price slippage guard");
    }
    if (amount === undefined) {
      throw new ExternalPolymarketRoutingError(400, "POLYMARKET_INVALID_PAYLOAD", "market orders require amount");
    }
  }
};

const assertMarketTradable = (market: ExternalMarketView, outcomeExternalId: string, tokenId: string, now: Date): void => {
  if (market.source !== "polymarket") {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_MARKET_UNSUPPORTED", "market is not a Polymarket source");
  }
  if (market.status !== "open" || market.resolvedAt) {
    throw new ExternalPolymarketRoutingError(409, "POLYMARKET_MARKET_NOT_TRADABLE", "market is not open for Polymarket trading");
  }
  if (market.closeTime && Date.parse(market.closeTime) <= now.getTime()) {
    throw new ExternalPolymarketRoutingError(409, "POLYMARKET_MARKET_NOT_TRADABLE", "market is past close time");
  }
  const outcome = market.outcomes.find((candidate) => candidate.externalOutcomeId === outcomeExternalId);
  if (!outcome || outcome.externalOutcomeId !== tokenId) {
    throw new ExternalPolymarketRoutingError(409, "POLYMARKET_TOKEN_OUTCOME_INVALID", "tokenId does not belong to the selected outcome");
  }
};

const assertMarketConstraints = (
  constraints: PolymarketMarketConstraints,
  orderInput: Record<string, unknown>,
): void => {
  const price = toFiniteNumber(orderInput.price, "orderInput.price");
  const size = toOptionalFiniteNumber(orderInput.size, "orderInput.size");
  const amount = toOptionalFiniteNumber(orderInput.amount, "orderInput.amount");
  const minSize = Number(constraints.minOrderSize);

  assertTickAligned(price, constraints.tickSize);
  if (Number.isFinite(minSize) && minSize > 0) {
    const candidateSize = size ?? amount;
    if (candidateSize === undefined || candidateSize < minSize) {
      throw new ExternalPolymarketRoutingError(400, "POLYMARKET_MIN_SIZE_INVALID", "order is below Polymarket minimum size");
    }
  }
};

const getSubmitter = (dependencies: ExternalPolymarketOrderRouteDependencies): PolymarketOrderSubmitter =>
  dependencies.submitter ?? createPolymarketOrderSubmitterFromEnv();

export const prepareExternalPolymarketOrderRoutePayload = async (
  input: ExternalPolymarketOrderRouteInput,
  dependencies: ExternalPolymarketOrderRouteDependencies = {},
): Promise<ExternalPolymarketOrderRoutePayload> => {
  const now = dependencies.now?.() ?? new Date();
  const builderCode = assertPolymarketBuilderConfigured();
  const userId = dependencies.requestUserId;

  if (!userId) {
    throw new ExternalPolymarketRoutingError(401, "AUTHENTICATION_REQUIRED", "authentication required");
  }

  const userWalletAddress = normalizeAddress(toTrimmedString(input.userWalletAddress, "userWalletAddress"));
  const marketSource = toTrimmedString(input.marketSource, "marketSource");
  const marketExternalId = toTrimmedString(input.marketExternalId, "marketExternalId");
  const outcomeExternalId = toTrimmedString(input.outcomeExternalId, "outcomeExternalId");
  const geoblock = readGeoblockProof(input.geoblock);
  const orderInput = toObject(input.orderInput, "orderInput");
  const signedOrder = readSignedOrder(input.signedOrder);
  const orderType = toOrderType(input.orderType);
  const confirmation = readUserConfirmation(input.userConfirmation);
  const tokenId = readTokenId(orderInput);

  assertRecentOrderTimestamp(signedOrder.timestamp, now);
  assertRecentIso(confirmation.confirmedAt, "userConfirmation.confirmedAt", MAX_CONFIRMATION_AGE_MS, now);
  assertRecentIso(geoblock.checkedAt, "geoblock.checkedAt", MAX_CONFIRMATION_AGE_MS, now);
  const geoblockVerified = await (dependencies.geoblockProofVerifier ?? defaultGeoblockProofVerifier)(geoblock);
  if (geoblockVerified !== true) {
    throw new ExternalPolymarketRoutingError(403, "POLYMARKET_GEOBLOCK_UNVERIFIED", "server-side Polymarket geoblock proof could not be verified");
  }
  assertOrderMatchesConfirmation({ orderInput, signedOrder, confirmation, orderType, builderCode });

  const linkedWallet = await (dependencies.linkedWalletLookup ?? defaultLinkedWalletLookup)(userId);
  if (!linkedWallet) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_WALLET_NOT_CONNECTED", "linked wallet is required");
  }
  const linkedWalletAddress = normalizeAddress(linkedWallet.walletAddress);
  if ("verifiedAt" in linkedWallet && !linkedWallet.verifiedAt) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_WALLET_NOT_VERIFIED", "linked wallet must be verified");
  }
  if (!dependencies.allowNonProductionSubmissionForTests && !isBetaUserAllowed({ userId, email: dependencies.requestUserEmail, walletAddress: linkedWalletAddress })) {
    throw new ExternalPolymarketRoutingError(403, "POLYMARKET_BETA_USER_NOT_ALLOWLISTED", "測試交易功能只限指定用戶");
  }
  if (linkedWalletAddress !== userWalletAddress || normalizeAddress(signedOrder.signer) !== linkedWalletAddress) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_SIGNER_MISMATCH", "signed order signer must match the linked user wallet");
  }
  if (!ALLOWED_SIGNATURE_TYPES.has(signedOrder.signatureType)) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_SIGNATURE_TYPE_UNSUPPORTED", "unsupported Polymarket signature type");
  }

  const signatureVerified = await dependencies.signatureVerifier?.({ signedOrder, expectedSigner: linkedWalletAddress, builderCode });
  if (signatureVerified !== true) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_USER_SIGNING_UNVERIFIED", "user-owned Polymarket order signature could not be verified");
  }

  const l2Lookup = await (dependencies.l2CredentialLookup ?? defaultL2CredentialLookup)(userId, linkedWalletAddress);
  if (l2Lookup.status === "revoked") {
    throw new ExternalPolymarketRoutingError(409, "POLYMARKET_CREDENTIALS_REVOKED", "設定 Polymarket 憑證");
  }
  if (l2Lookup.status !== "present" || !l2Lookup.credentials) {
    throw new ExternalPolymarketRoutingError(409, "POLYMARKET_CREDENTIALS_MISSING", "設定 Polymarket 憑證");
  }

  const market = await getExternalMarketRecord(marketSource, marketExternalId);
  if (!market) {
    throw new ExternalPolymarketRoutingError(404, "POLYMARKET_MARKET_NOT_FOUND", "Polymarket market not found");
  }
  assertMarketTradable(market, outcomeExternalId, tokenId, now);
  if (isMarketStale(market, now)) {
    throw new ExternalPolymarketRoutingError(409, "POLYMARKET_MARKET_STALE", "market data is stale");
  }

  const submitter = getSubmitter(dependencies);
  const constraints = await submitter.getMarketConstraints(market.externalId, tokenId);
  assertMarketConstraints(constraints, orderInput);

  const payload: ExternalPolymarketOrderRoutePayload = {
    userId,
    userWalletAddress,
    linkedWalletAddress,
    l2CredentialStatus: "present",
    l2Credentials: l2Lookup.credentials,
    market,
    constraints,
    geoblock,
    orderInput: { ...orderInput, builderCode },
    signedOrder,
    orderType,
    userConfirmation: confirmation,
  };

  if (!dependencies.allowNonProductionSubmissionForTests) {
    if (!dependencies.balanceAllowanceLookup && !submitter.checkBalanceAllowance) {
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_BALANCE_ALLOWANCE_UNAVAILABLE", "Polymarket balance and allowance checks are unavailable");
    }
    const balance = dependencies.balanceAllowanceLookup
      ? await dependencies.balanceAllowanceLookup({
          userId,
          walletAddress: linkedWalletAddress,
          funderAddress: normalizeAddress(signedOrder.maker),
          tokenId,
          side: confirmation.side,
          price: confirmation.price,
          size: confirmation.size ?? confirmation.amount ?? 0,
        })
      : await submitter.checkBalanceAllowance!(payload);
    if (!balance.balanceSufficient) {
      throw new ExternalPolymarketRoutingError(409, "POLYMARKET_INSUFFICIENT_BALANCE", "增值錢包");
    }
    if (!balance.allowanceSufficient) {
      throw new ExternalPolymarketRoutingError(409, "POLYMARKET_INSUFFICIENT_ALLOWANCE", "授權不足");
    }
  }

  return payload;
};

export const routeExternalPolymarketOrder = async (
  input: ExternalPolymarketOrderRouteInput,
  dependencies: ExternalPolymarketOrderRouteDependencies = {},
): Promise<ExternalPolymarketOrderRouteResult> => {
  try {
    const readiness = getExternalPolymarketRoutingReadiness();
    incrementCounter("routed_trade_attempted", { mode: readiness.submitterMode });

    if (!readiness.builderCodeConfigured) throw new PolymarketBuilderConfigurationError();
    if (!readiness.routedTradingEnabled) {
      incrementCounter("routed_trade_disabled_reason", { reason: "feature_disabled" });
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_ROUTED_TRADING_DISABLED", "external Polymarket routed trading is disabled");
    }
    if (!dependencies.allowNonProductionSubmissionForTests && !isProductionLikeRuntime()) {
      incrementCounter("routed_trade_disabled_reason", { reason: "runtime_not_production_like" });
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_RUNTIME_NOT_ENABLED", "live Polymarket routed trading requires production or staging runtime");
    }

    const submitter = getSubmitter(dependencies);
    if (submitter.mode !== "real") {
      incrementCounter("routed_trade_disabled_reason", { reason: "submitter_unavailable" });
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_SUBMITTER_UNAVAILABLE", "Polymarket submitter unavailable");
    }

    const health = await submitter.healthCheck();
    if (!health.ok) {
      incrementCounter("routed_trade_disabled_reason", { reason: "submitter_health_failed" });
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_SUBMITTER_UNHEALTHY", "Polymarket submitter health check failed");
    }
    if (process.env.POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED === "true") {
      incrementCounter("routed_trade_disabled_reason", { reason: "attribution_recording_unavailable" });
      throw new ExternalPolymarketRoutingError(503, "POLYMARKET_ATTRIBUTION_RECORDING_UNAVAILABLE", "Polymarket attribution recording is not ready");
    }

    const payload = await prepareExternalPolymarketOrderRoutePayload(input, { ...dependencies, submitter });
    incrementCounter("builder_attribution_prepared", { status: "signed" });
    incrementCounter("user_order_signature_requested", { status: "verified" });
    incrementCounter("user_order_signature_completed", { status: "verified" });
    const upstream = await submitter.submitOrder(payload);
    await (dependencies.auditRecorder ?? recordRoutedOrderAudit)(payload, upstream);
    await dependencies.routedOrderAttemptRecorder?.(payload, upstream);

    incrementCounter("routed_trade_submitted", { status: upstream.status || "submitted" });
    incrementCounter("polymarket_builder_order_attribution_total", { status: "submitted" });
    return {
      status: "submitted",
      attribution: {
        builderCodeAttached: true,
        builderCode: payload.orderInput.builderCode,
        attachedBeforeUserSignature: true,
      },
      upstream,
    };
  } catch (error) {
    incrementCounter("routed_trade_submit_failed", {
      code: error instanceof Error && "code" in error ? String((error as { code: string }).code) : "POLYMARKET_ORDER_ATTRIBUTION_FAILED",
    });
    logger.error("polymarket_builder.order_attribution_failed", {
      code: error instanceof Error && "code" in error ? String((error as { code: string }).code) : "POLYMARKET_ORDER_ATTRIBUTION_FAILED",
    });
    throw error;
  }
};

export const mapExternalPolymarketRoutingError = (error: unknown): { status: number; payload: { error: string; code: string } } => {
  if (error instanceof PolymarketBuilderConfigurationError) {
    return { status: 503, payload: { error: "external Polymarket routed trading is disabled because POLY_BUILDER_CODE is not configured", code: error.code } };
  }
  if (error instanceof PolymarketSubmitterError) {
    return { status: error.status, payload: { error: error.safeMessage, code: error.code } };
  }
  if (error instanceof ExternalPolymarketRoutingError) {
    return { status: error.status, payload: { error: error.message, code: error.code } };
  }
  return { status: 500, payload: { error: "external Polymarket order routing failed", code: "POLYMARKET_ORDER_ATTRIBUTION_FAILED" } };
};
