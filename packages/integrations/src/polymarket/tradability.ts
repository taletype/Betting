import type { PolymarketMarket } from "./types";

export type PolymarketTradabilityCode =
  | "tradable"
  | "resolved"
  | "cancelled"
  | "closed"
  | "inactive"
  | "not_accepting_orders"
  | "orderbook_disabled"
  | "stale"
  | "unknown";

export interface PolymarketTradabilityResult {
  tradable: boolean;
  code: PolymarketTradabilityCode;
  labelZhHk: string;
  labelEn: string;
  reason: string;
}

type PolymarketTradabilityInput = Pick<
  PolymarketMarket,
  | "active"
  | "archived"
  | "cancelled"
  | "canceled"
  | "closed"
  | "closedTime"
  | "closeTime"
  | "accepting_orders"
  | "acceptingOrders"
  | "enable_order_book"
  | "enableOrderBook"
  | "orderBookEnabled"
  | "endDate"
  | "end_date_iso"
  | "resolved_at"
  | "resolvedAt"
  | "resolutionStatus"
  | "resolution_status"
  | "status"
> & {
  stale?: unknown;
};

const labels: Record<PolymarketTradabilityCode, { labelZhHk: string; labelEn: string }> = {
  tradable: { labelZhHk: "可交易", labelEn: "Tradable" },
  closed: { labelZhHk: "市場已關閉", labelEn: "Market closed" },
  resolved: { labelZhHk: "市場已結算", labelEn: "Market resolved" },
  cancelled: { labelZhHk: "市場已取消", labelEn: "Market cancelled" },
  inactive: { labelZhHk: "市場暫不可交易", labelEn: "Market temporarily unavailable" },
  not_accepting_orders: { labelZhHk: "市場暫不接受訂單", labelEn: "Market not accepting orders" },
  orderbook_disabled: { labelZhHk: "訂單簿暫不可用", labelEn: "Order book unavailable" },
  stale: { labelZhHk: "市場資料可能過期", labelEn: "Market data may be stale" },
  unknown: { labelZhHk: "市場只供瀏覽", labelEn: "Browse only" },
};

const result = (
  code: PolymarketTradabilityCode,
  reason: string,
): PolymarketTradabilityResult => ({
  tradable: code === "tradable",
  code,
  labelZhHk: labels[code].labelZhHk,
  labelEn: labels[code].labelEn,
  reason,
});

const getString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;

const getBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
};

const getMergedBoolean = (...values: unknown[]): boolean | null => {
  let sawFalse = false;
  for (const value of values) {
    const parsed = getBoolean(value);
    if (parsed === true) return true;
    if (parsed === false) sawFalse = true;
  }
  return sawFalse ? false : null;
};

const hasPastTime = (value: unknown, now: Date): boolean => {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= now.getTime();
};

const hasAnyLiveOrderFlag = (acceptingOrders: boolean | null, orderBookEnabled: boolean | null): boolean =>
  acceptingOrders !== null || orderBookEnabled !== null;

export const getPolymarketTradability = (
  market: PolymarketTradabilityInput,
  options: { now?: Date } | Date = {},
): PolymarketTradabilityResult => {
  const now = options instanceof Date ? options : options.now ?? new Date();
  const status = getString(market.status);
  const resolutionStatus = getString(market.resolutionStatus ?? market.resolution_status);
  const active = getBoolean(market.active);
  const closed = getMergedBoolean(market.closed);
  const archived = getMergedBoolean(market.archived);
  const cancelled = getMergedBoolean(market.cancelled, market.canceled);
  const acceptingOrders = getMergedBoolean(market.accepting_orders, market.acceptingOrders);
  const orderBookEnabled = getMergedBoolean(
    market.enable_order_book,
    market.enableOrderBook,
    market.orderBookEnabled,
  );
  const stale = getBoolean(market.stale);

  if (market.resolved_at || market.resolvedAt || status === "resolved" || resolutionStatus === "resolved") {
    return result("resolved", "Polymarket reports this market as resolved.");
  }
  if (
    cancelled === true ||
    archived === true ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "archived"
  ) {
    return result("cancelled", "Polymarket reports this market as cancelled or archived.");
  }
  if (closed === true || status === "closed") {
    return result("closed", "Polymarket reports this market as closed.");
  }
  if (active === false) {
    return result("inactive", "Polymarket reports this market as inactive.");
  }

  const strongAcceptingSignal = active === true && closed === false && acceptingOrders === true;
  const strongOrderbookSignal = active === true && closed === false && orderBookEnabled === true;
  if (strongAcceptingSignal || strongOrderbookSignal) {
    return result("tradable", "Polymarket live flags indicate the market is open.");
  }

  if (acceptingOrders === false) {
    return result("not_accepting_orders", "Polymarket is not accepting orders for this market.");
  }
  if (orderBookEnabled === false) {
    return result("orderbook_disabled", "Polymarket order book is disabled for this market.");
  }

  const pastClose =
    hasPastTime(market.closeTime, now) ||
    hasPastTime(market.closedTime, now) ||
    hasPastTime(market.endDate, now) ||
    hasPastTime(market.end_date_iso, now);
  if (pastClose && status === "open") {
    return result("unknown", "The market is marked open but lacks first-class Polymarket order flags.");
  }
  if (pastClose && !hasAnyLiveOrderFlag(acceptingOrders, orderBookEnabled)) {
    return result("closed", "The market close time is in the past and no live order flags were present.");
  }
  if (pastClose && active === true && closed === false) {
    return result("closed", "The market close time is in the past without a strong live tradability signal.");
  }
  if (stale === true) {
    return result("stale", "The cached Polymarket market data may be stale.");
  }

  if (status === "open") {
    return result("unknown", "The market is marked open but lacks first-class Polymarket order flags.");
  }

  return result("unknown", "Polymarket tradability could not be determined from the available fields.");
};
