import type { ExternalMarketApiRecord } from "./api";
import {
  hasExternalMarketActivity,
  hasExternalMarketPriceData,
  isExternalMarketOpenNow,
  isExternalMarketStale,
} from "./external-market-status";

const cappedLogScore = (value: number | null | undefined, cap: number): number => {
  const numeric = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  return Math.min(cap, Math.log10(numeric + 1));
};

const hasFutureCloseTime = (market: ExternalMarketApiRecord): boolean => {
  const value = market.closeTime ?? market.endTime;
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
};

export const getMarketQualityScore = (market: ExternalMarketApiRecord): number => {
  let score = 0;

  if (isExternalMarketOpenNow(market)) score += 100;
  if (hasExternalMarketPriceData(market)) score += 50;
  if (hasExternalMarketActivity(market)) score += 30;
  if (!isExternalMarketStale(market)) score += 20;
  if (market.imageUrl || market.iconUrl) score += 10;
  if (market.outcomes.length >= 2) score += 10;
  if (hasFutureCloseTime(market)) score += 5;

  score += cappedLogScore(market.volume24h ?? market.volumeTotal, 25);
  score += cappedLogScore(market.liquidity ?? market.volumeTotal, 25);

  if (market.status === "closed" || market.status === "resolved" || market.status === "cancelled") score -= 100;
  if (isExternalMarketStale(market)) score -= 50;
  if (!hasExternalMarketPriceData(market)) score -= 25;

  return Number.isFinite(score) ? score : 0;
};
