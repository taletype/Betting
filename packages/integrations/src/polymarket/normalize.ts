import type { NormalizedExternalMarket, NormalizedExternalOutcome } from "../index";
import type { PolymarketMarket, PolymarketToken } from "./types";

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
  } catch {
    // ignore parse errors
  }
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
};

const normalizeSlug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "market";

const toIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const getString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getStatusString = (market: PolymarketMarket): string | null =>
  getString(market.status ?? market.resolutionStatus ?? market.resolution_status)?.toLowerCase() ?? null;

const hasPastTime = (value: unknown, now: Date): boolean => {
  const iso = toIsoOrNull(value);
  return iso !== null && new Date(iso).getTime() <= now.getTime();
};

export const resolvePolymarketMarketStatus = (
  market: Pick<
    PolymarketMarket,
    | "active"
    | "archived"
    | "cancelled"
    | "closed"
    | "closedTime"
    | "closeTime"
    | "endDate"
    | "end_date_iso"
    | "resolved_at"
    | "resolvedAt"
    | "resolutionStatus"
    | "resolution_status"
    | "status"
  >,
  now = new Date(),
): NormalizedExternalMarket["status"] => {
  const status = getStatusString(market as PolymarketMarket);

  if (status === "resolved" || market.resolved_at || market.resolvedAt) return "resolved";
  if (status === "cancelled" || status === "canceled" || market.cancelled === true || market.archived === true) return "cancelled";
  if (status === "closed" || market.closed === true) return "closed";
  if (
    hasPastTime(market.closeTime, now) ||
    hasPastTime(market.closedTime, now) ||
    hasPastTime(market.endDate, now) ||
    hasPastTime(market.end_date_iso, now)
  ) {
    return "closed";
  }
  if (market.active === false) return "closed";

  return "open";
};

const normalizeOutcome = (token: PolymarketToken, index: number): NormalizedExternalOutcome => {
  const title = token.outcome?.trim() || `Outcome ${index + 1}`;
  const normalized = title.toLowerCase();
  return {
    externalOutcomeId: token.token_id ?? token.tokenId ?? `${index}`,
    title,
    slug: normalizeSlug(title),
    outcomeIndex: index,
    yesNo: normalized === "yes" ? "yes" : normalized === "no" ? "no" : null,
    bestBid: parseNumber(token.bestBid),
    bestAsk: parseNumber(token.bestAsk),
    lastPrice: parseNumber(token.price),
    volume: parseNumber(token.volume),
  };
};

export const normalizePolymarketOutcomes = (market: PolymarketMarket): NormalizedExternalOutcome[] => {
  if ((market.tokens ?? []).length > 0) return (market.tokens ?? []).map(normalizeOutcome);

  const outcomeTitles = parseStringArray(market.outcomes);
  const outcomePrices = parseStringArray(market.outcomePrices).map((entry) => parseNumber(entry));
  const tokenIds = parseStringArray(market.clobTokenIds);

  return outcomeTitles.map((title, index) => {
    const normalized = title.toLowerCase();
    return {
      externalOutcomeId: tokenIds[index] ?? `${index}`,
      title,
      slug: normalizeSlug(title),
      outcomeIndex: index,
      yesNo: normalized === "yes" ? "yes" : normalized === "no" ? "no" : null,
      bestBid: null,
      bestAsk: null,
      lastPrice: outcomePrices[index] ?? null,
      volume: null,
    };
  });
};

export const normalizePolymarketMarket = (market: PolymarketMarket): NormalizedExternalMarket | null => {
  const externalId = String(market.id ?? "").trim();
  const title = market.question?.trim() ?? "";
  if (!externalId || !title) return null;

  const outcomes = normalizePolymarketOutcomes(market);
  const closeTime = toIsoOrNull(market.closeTime ?? market.closedTime ?? market.endDate ?? market.end_date_iso);
  return {
    source: "polymarket",
    externalId,
    slug: market.slug?.trim() || normalizeSlug(title),
    title,
    description: market.description?.trim() ?? "",
    url: market.url ?? (market.slug ? `https://polymarket.com/event/${market.slug}` : null),
    status: resolvePolymarketMarketStatus(market),
    closeTime,
    endTime: toIsoOrNull(market.endDate ?? market.end_date_iso),
    resolvedAt: toIsoOrNull(market.resolved_at),
    bestBid: parseNumber(market.bestBid),
    bestAsk: parseNumber(market.bestAsk),
    lastTradePrice: parseNumber(market.lastTradePrice),
    volume24h: parseNumber(market.volume24hr),
    volumeTotal: parseNumber(market.volume),
    outcomes,
    recentTrades: [],
    rawPayload: market,
  };
};
