import { fetchPolymarketOrderBook, getPolymarketBuilderCode } from "@bet/integrations";

import type { ExternalMarketApiRecord } from "../../../lib/api";

export type PolymarketPreviewSide = "BUY" | "SELL";
export type PolymarketPreviewOrderType = "GTC" | "GTD" | "FOK" | "FAK";
export type PolymarketPreviewDisabledCode =
  | "auth_required"
  | "wallet_not_connected"
  | "canary_not_allowed"
  | "beta_user_not_allowlisted"
  | "region_unknown"
  | "geoblocked"
  | "credentials_missing"
  | "signature_required"
  | "builder_code_missing"
  | "feature_disabled"
  | "market_not_tradable"
  | "invalid_order"
  | "submitter_unavailable";

export const polymarketDisabledReasonZh: Record<PolymarketPreviewDisabledCode, string> = {
  auth_required: "尚未登入",
  wallet_not_connected: "尚未連接錢包",
  canary_not_allowed: "測試交易功能只限指定用戶",
  beta_user_not_allowlisted: "測試交易功能只限指定用戶",
  region_unknown: "暫時未能確認所在地區支援狀態",
  geoblocked: "你目前所在地區暫不支援 Polymarket 下單",
  credentials_missing: "需要 Polymarket 憑證",
  signature_required: "需要用戶自行簽署訂單",
  builder_code_missing: "Builder Code 未設定",
  feature_disabled: "交易功能尚未啟用",
  market_not_tradable: "市場暫時不可交易",
  invalid_order: "價格或數量無效",
  submitter_unavailable: "交易提交器未準備好",
};

export interface PolymarketOrderPreviewInput {
  marketSource?: unknown;
  marketExternalId?: unknown;
  outcomeExternalId?: unknown;
  tokenId?: unknown;
  side?: unknown;
  price?: unknown;
  size?: unknown;
  amount?: unknown;
  orderType?: unknown;
  orderStyle?: unknown;
  slippageBps?: unknown;
  expiration?: unknown;
  loggedIn?: boolean;
  walletConnected?: boolean;
  geoblockAllowed?: boolean;
  l2CredentialsPresent?: boolean;
  userSigningAvailable?: boolean;
  submitterAvailable?: boolean;
}

export interface PolymarketOrderPreviewResult {
  ok: boolean;
  builderCodeConfigured: boolean;
  routedTradingEnabled: boolean;
  disabledReasonCodes: PolymarketPreviewDisabledCode[];
  disabledReasons: string[];
  market: {
    source: "polymarket";
    externalId: string;
    slug: string;
    title: string;
    tradable: boolean;
  } | null;
  order: {
    tokenId: string | null;
    outcomeExternalId: string | null;
    side: PolymarketPreviewSide | null;
    orderType: PolymarketPreviewOrderType | null;
    orderStyle: "limit" | "marketable_limit";
    price: number | null;
    worstAcceptablePrice: number | null;
    size: number | null;
    amount: number | null;
    notional: number | null;
    estimatedMaxFees: number | null;
    expiration: number | null;
  };
  constraints: {
    tickSize: string;
    minSize: string;
    source: "clob" | "fallback";
  };
}

const DEFAULT_TICK_SIZE = "0.01";
const DEFAULT_MIN_SIZE = "5";
const SUPPORTED_ORDER_TYPES = new Set<PolymarketPreviewOrderType>(["GTC", "GTD", "FOK", "FAK"]);

const toTrimmedString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const toSide = (value: unknown): PolymarketPreviewSide | null => {
  const side = toTrimmedString(value)?.toUpperCase();
  return side === "BUY" || side === "SELL" ? side : null;
};

const toOrderType = (value: unknown): PolymarketPreviewOrderType | null => {
  const orderType = (toTrimmedString(value) ?? "GTC").toUpperCase() as PolymarketPreviewOrderType;
  return SUPPORTED_ORDER_TYPES.has(orderType) ? orderType : null;
};

const isTickAligned = (price: number, tickSize: string): boolean => {
  const tick = Number(tickSize);
  if (!Number.isFinite(tick) || tick <= 0) return false;
  const units = price / tick;
  return Math.abs(units - Math.round(units)) <= 1e-8;
};

const marketMatches = (market: ExternalMarketApiRecord, externalId: string): boolean =>
  market.source === "polymarket" &&
  (market.externalId.toLowerCase() === externalId.toLowerCase() ||
    market.slug.toLowerCase() === externalId.toLowerCase() ||
    market.id.toLowerCase() === externalId.toLowerCase());

const isMarketTradable = (market: ExternalMarketApiRecord | null, now: Date): boolean => {
  if (!market || market.source !== "polymarket") return false;
  if (market.status !== "open" || market.resolvedAt) return false;
  return !market.closeTime || Date.parse(market.closeTime) > now.getTime();
};

const getConstraints = async (tokenId: string): Promise<PolymarketOrderPreviewResult["constraints"]> => {
  try {
    const book = await fetchPolymarketOrderBook(tokenId);
    return {
      tickSize: book.tickSize ?? DEFAULT_TICK_SIZE,
      minSize: book.minOrderSize ?? DEFAULT_MIN_SIZE,
      source: "clob",
    };
  } catch {
    return { tickSize: DEFAULT_TICK_SIZE, minSize: DEFAULT_MIN_SIZE, source: "fallback" };
  }
};

export const previewPolymarketOrder = async (
  input: PolymarketOrderPreviewInput,
  markets: ExternalMarketApiRecord[],
  now = new Date(),
): Promise<PolymarketOrderPreviewResult> => {
  const marketSource = toTrimmedString(input.marketSource);
  const marketExternalId = toTrimmedString(input.marketExternalId);
  const tokenId = toTrimmedString(input.tokenId);
  const outcomeExternalId = toTrimmedString(input.outcomeExternalId) ?? tokenId;
  const side = toSide(input.side);
  const orderType = toOrderType(input.orderType);
  const orderStyle = input.orderStyle === "marketable_limit" || orderType === "FOK" || orderType === "FAK"
    ? "marketable_limit"
    : "limit";
  const price = toFiniteNumber(input.price);
  const size = toFiniteNumber(input.size);
  const amount = toFiniteNumber(input.amount);
  const slippageBps = toFiniteNumber(input.slippageBps) ?? 0;
  const expiration = toFiniteNumber(input.expiration);
  const builderCodeConfigured = getPolymarketBuilderCode() !== null;
  const routedTradingEnabled =
    process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true" ||
    process.env.POLYMARKET_ROUTED_TRADING_BETA_ENABLED === "true";
  const market = marketSource === "polymarket" && marketExternalId
    ? markets.find((candidate) => marketMatches(candidate, marketExternalId)) ?? null
    : null;
  const constraints = tokenId ? await getConstraints(tokenId) : { tickSize: DEFAULT_TICK_SIZE, minSize: DEFAULT_MIN_SIZE, source: "fallback" as const };
  const minSize = Number(constraints.minSize);
  const matchingOutcome = market?.outcomes.find((outcome) => outcome.externalOutcomeId === outcomeExternalId);
  const tokenValid = Boolean(tokenId && outcomeExternalId && matchingOutcome?.externalOutcomeId === tokenId);
  const tradable = isMarketTradable(market, now);
  const basePriceValid = price !== null && price > 0 && price < 1 && isTickAligned(price, constraints.tickSize);
  const baseSize = orderStyle === "marketable_limit" ? amount ?? size : size;
  const sizeValid = baseSize !== null && baseSize > 0 && (!Number.isFinite(minSize) || minSize <= 0 || baseSize >= minSize);
  const orderTypeValid = orderType !== null && (orderType !== "GTD" || (expiration !== null && expiration > Math.floor(now.getTime() / 1000) + 60));
  const slippageValid = orderStyle === "limit" || (slippageBps >= 0 && slippageBps <= 5_000);
  const orderValid = Boolean(tokenValid && side && basePriceValid && sizeValid && orderTypeValid && slippageValid);
  const worstAcceptablePrice = price === null
    ? null
    : orderStyle === "marketable_limit"
      ? Math.min(0.99, Math.max(0.01, price * (side === "SELL" ? 1 - slippageBps / 10_000 : 1 + slippageBps / 10_000)))
      : price;
  const notional = price !== null && baseSize !== null ? price * baseSize : null;
  const disabledReasonCodes: PolymarketPreviewDisabledCode[] = [];

  if (!routedTradingEnabled) disabledReasonCodes.push("feature_disabled");
  if (!input.loggedIn) disabledReasonCodes.push("auth_required");
  if (!input.walletConnected) disabledReasonCodes.push("wallet_not_connected");
  if (input.geoblockAllowed === false) disabledReasonCodes.push("geoblocked");
  if (input.geoblockAllowed === undefined) disabledReasonCodes.push("region_unknown");
  if (!input.l2CredentialsPresent) disabledReasonCodes.push("credentials_missing");
  if (!input.userSigningAvailable) disabledReasonCodes.push("signature_required");
  if (!builderCodeConfigured) disabledReasonCodes.push("builder_code_missing");
  if (!tradable) disabledReasonCodes.push("market_not_tradable");
  if (!orderValid) disabledReasonCodes.push("invalid_order");
  if (!input.submitterAvailable) disabledReasonCodes.push("submitter_unavailable");

  return {
    ok: disabledReasonCodes.length === 0,
    builderCodeConfigured,
    routedTradingEnabled,
    disabledReasonCodes,
    disabledReasons: disabledReasonCodes.map((code) => polymarketDisabledReasonZh[code]),
    market: market
      ? {
          source: "polymarket",
          externalId: market.externalId,
          slug: market.slug,
          title: market.title,
          tradable,
        }
      : null,
    order: {
      tokenId: tokenId ?? null,
      outcomeExternalId: outcomeExternalId ?? null,
      side,
      orderType,
      orderStyle,
      price,
      worstAcceptablePrice,
      size,
      amount,
      notional,
      estimatedMaxFees: notional === null ? null : notional * 0.015,
      expiration,
    },
    constraints,
  };
};
