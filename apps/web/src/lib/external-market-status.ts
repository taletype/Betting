import type { ExternalMarketApiRecord } from "./api";
import { getExternalPolymarketTradability } from "./polymarket-tradability";

const toTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const getConfiguredStaleThresholdMs = (): number => {
  const parsed = Number(process.env.POLYMARKET_MARKET_STALE_THRESHOLD_MS ?? 15 * 60 * 1000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60 * 1000;
};

const getMarketStaleAfter = (market: ExternalMarketApiRecord): string | null => {
  const provenance = market.sourceProvenance ?? market.provenance;
  if (!provenance || typeof provenance !== "object") return null;
  const staleAfter = (provenance as Record<string, unknown>).staleAfter;
  return typeof staleAfter === "string" ? staleAfter : null;
};

export const isExternalMarketStale = (market: ExternalMarketApiRecord): boolean => {
  const provenance = market.sourceProvenance ?? market.provenance;
  if (provenance && typeof provenance === "object" && (provenance as Record<string, unknown>).stale === true) {
    return true;
  }

  const staleAfterTime = toTime(getMarketStaleAfter(market));
  if (staleAfterTime !== null) {
    return staleAfterTime <= Date.now();
  }

  const lastSeenTime = toTime(market.lastUpdatedAt ?? market.lastSyncedAt ?? market.updatedAt);
  return lastSeenTime !== null && Date.now() - lastSeenTime > getConfiguredStaleThresholdMs();
};

export const hasExternalMarketActivity = (market: ExternalMarketApiRecord): boolean =>
  (market.volume24h ?? 0) > 0 || (market.liquidity ?? market.volumeTotal ?? 0) > 0;

export const hasExternalMarketPriceData = (market: ExternalMarketApiRecord): boolean =>
  [market.lastTradePrice, market.bestBid, market.bestAsk].some((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ||
  market.outcomes.some((outcome) =>
    [outcome.lastPrice, outcome.bestBid, outcome.bestAsk].some((value) => typeof value === "number" && Number.isFinite(value) && value > 0),
  );

export const isExternalMarketOpenNow = (market: ExternalMarketApiRecord): boolean => {
  if (market.status !== "open" || market.resolvedAt) return false;
  if (market.source === "polymarket") {
    const tradability = getExternalPolymarketTradability(market);
    if (tradability.code === "tradable") return true;
    if (
      tradability.code === "closed" ||
      tradability.code === "resolved" ||
      tradability.code === "cancelled" ||
      tradability.code === "inactive" ||
      tradability.code === "not_accepting_orders" ||
      tradability.code === "orderbook_disabled"
    ) {
      return false;
    }
  }
  const closeTime = toTime(market.closeTime ?? market.endTime);
  return closeTime === null || closeTime > Date.now();
};
