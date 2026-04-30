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
import {
  createPolymarketOrderSubmitterFromEnv,
  PolymarketSubmitterError,
  type PolymarketL2Credentials,
  type PolymarketMarketConstraints,
  type PolymarketOrderSubmitterResponse,
} from "./submitter";

export type PolymarketL2CredentialStatus = "present" | "missing" | "expired";
export type ExternalPolymarketOrderSide = "BUY" | "SELL";
export type ExternalPolymarketOrderType = "GTC" | "GTD" | "FOK" | "FAK";

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
    signer: string;
    tokenId: string;
    side: ExternalPolymarketOrderSide;
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
  submitOrder(payload: ExternalPolymarketOrderRoutePayload): Promise<PolymarketOrderSubmitterResponse>;
}

export interface ExternalPolymarketOrderRouteDependencies {
  requestUserId?: string;
  submitter?: PolymarketOrderSubmitter;
  linkedWalletLookup?: (userId: string) => Promise<Pick<LinkedWallet, "walletAddress"> | null>;
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

const defaultLinkedWalletLookup = async (userId: string) =>
  getLinkedWalletForUser(createDatabaseClient(), userId);

const defaultL2CredentialLookup = async (): Promise<L2CredentialLookupResult> => ({
  status: "missing",
});

const defaultGeoblockProofVerifier = async (): Promise<boolean> => false;

const normalizeAddress = (value: string): string => value.trim().toLowerCase();

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
    signer: toTrimmedString(signedOrder.signer, "signedOrder.signer"),
    tokenId: toTrimmedString(signedOrder.tokenId, "signedOrder.tokenId"),
    side: toSide(signedOrder.side, "signedOrder.side"),
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

const isExternalPolymarketRoutingEnabled = (): boolean =>
  readBooleanFlag("POLYMARKET_ROUTED_TRADING_ENABLED", { defaultValue: false });

export const getExternalPolymarketRoutingReadiness = () => ({
  builderCodeConfigured: getPolymarketBuilderCode() !== null,
  routedTradingEnabled: isExternalPolymarketRoutingEnabled(),
  submitterMode: process.env.POLYMARKET_CLOB_SUBMITTER === "real" ? "real" : "disabled",
});

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
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_MARKET_NOT_TRADABLE", "market is not open for Polymarket trading");
  }
  if (market.closeTime && Date.parse(market.closeTime) <= now.getTime()) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_MARKET_NOT_TRADABLE", "market is past close time");
  }
  const outcome = market.outcomes.find((candidate) => candidate.externalOutcomeId === outcomeExternalId);
  if (!outcome || outcome.externalOutcomeId !== tokenId) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_TOKEN_OUTCOME_INVALID", "tokenId does not belong to the selected outcome");
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
    throw new ExternalPolymarketRoutingError(401, "POLYMARKET_AUTH_REQUIRED", "authenticated user is required");
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
  if (linkedWalletAddress !== userWalletAddress || normalizeAddress(signedOrder.signer) !== linkedWalletAddress) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_SIGNER_MISMATCH", "signed order signer must match the linked user wallet");
  }

  const signatureVerified = await dependencies.signatureVerifier?.({ signedOrder, expectedSigner: linkedWalletAddress, builderCode });
  if (signatureVerified !== true) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_USER_SIGNING_UNVERIFIED", "user-owned Polymarket order signature could not be verified");
  }

  const l2Lookup = await (dependencies.l2CredentialLookup ?? defaultL2CredentialLookup)(userId, linkedWalletAddress);
  if (l2Lookup.status === "expired") {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_CREDENTIALS_EXPIRED", "Polymarket credentials expired");
  }
  if (l2Lookup.status !== "present" || !l2Lookup.credentials) {
    throw new ExternalPolymarketRoutingError(400, "POLYMARKET_CREDENTIALS_MISSING", "Polymarket credentials required");
  }

  const market = await getExternalMarketRecord(marketSource, marketExternalId);
  if (!market) {
    throw new ExternalPolymarketRoutingError(404, "POLYMARKET_MARKET_NOT_FOUND", "Polymarket market not found");
  }
  assertMarketTradable(market, outcomeExternalId, tokenId, now);

  const submitter = getSubmitter(dependencies);
  const constraints = await submitter.getMarketConstraints(market.externalId, tokenId);
  assertMarketConstraints(constraints, orderInput);

  return {
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

    const payload = await prepareExternalPolymarketOrderRoutePayload(input, { ...dependencies, submitter });
    incrementCounter("builder_attribution_prepared", { status: "signed" });
    incrementCounter("user_order_signature_requested", { status: "verified" });
    incrementCounter("user_order_signature_completed", { status: "verified" });
    const upstream = await submitter.submitOrder(payload);
    await (dependencies.auditRecorder ?? recordRoutedOrderAudit)(payload, upstream);

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
