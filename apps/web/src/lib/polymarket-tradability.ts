import { getPolymarketTradability, type PolymarketTradabilityResult } from "@bet/integrations";

import type { ExternalMarketApiRecord } from "./api";

const getStatusFlags = (market: ExternalMarketApiRecord): Record<string, unknown> => {
  const provenance = market.sourceProvenance ?? market.provenance;
  const record = provenance && typeof provenance === "object" ? provenance as Record<string, unknown> : {};
  return record.statusFlags && typeof record.statusFlags === "object" ? record.statusFlags as Record<string, unknown> : {};
};

const readBooleanFlag = (record: Record<string, unknown>, ...keys: string[]): boolean | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }
  return undefined;
};

export const getExternalPolymarketTradability = (
  market: ExternalMarketApiRecord | null,
  options: { stale?: boolean; now?: Date } = {},
): PolymarketTradabilityResult => {
  if (!market || market.source !== "polymarket") {
    return getPolymarketTradability({ status: "closed", stale: true }, { now: options.now });
  }

  const flags = getStatusFlags(market);

  return getPolymarketTradability({
    status: market.status,
    active: readBooleanFlag(flags, "active") ?? (market.status === "open" ? true : undefined),
    closed: readBooleanFlag(flags, "closed") ?? (market.status === "closed" ? true : undefined),
    archived: readBooleanFlag(flags, "archived") ?? (market.status === "cancelled" ? true : undefined),
    cancelled: readBooleanFlag(flags, "cancelled", "canceled") ?? (market.status === "cancelled" ? true : undefined),
    acceptingOrders: readBooleanFlag(flags, "acceptingOrders", "accepting_orders"),
    enableOrderBook: readBooleanFlag(flags, "enableOrderBook", "enable_order_book", "orderBookEnabled"),
    endDate: typeof flags.endDate === "string" ? flags.endDate : market.endTime ?? undefined,
    end_date_iso: typeof flags.endDateIso === "string" ? flags.endDateIso : market.closeTime ?? undefined,
    resolvedAt: market.resolvedAt ?? undefined,
    stale: options.stale === true,
  }, { now: options.now });
};
