import type { NormalizedExternalTradeTick } from "../index";
import { createProvenance } from "./provenance";
import type { PolymarketDataTrade } from "./types";

const DATA_API_BASE_URL = "https://data-api.polymarket.com";

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeSide = (value: unknown): "buy" | "sell" | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "buy" ? "buy" : normalized === "sell" ? "sell" : null;
};

const toIsoTimestamp = (value: unknown): string | null => {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }

  const millis = parsed >= 1_000_000_000_000 ? parsed : parsed * 1_000;
  const timestamp = new Date(millis);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
};

const buildTradeId = (trade: PolymarketDataTrade): string | null => {
  const conditionId = trade.conditionId?.trim();
  const timestamp = String(trade.timestamp ?? "").trim();
  const asset = trade.asset?.trim();
  const txHash = trade.transactionHash?.trim();
  const side = normalizeSide(trade.side) ?? "unknown";
  const price = String(trade.price ?? "").trim();
  const size = String(trade.size ?? "").trim();
  const proxyWallet = trade.proxyWallet?.trim().toLowerCase() ?? "unknown";

  if (!conditionId || !timestamp || !price || !size) {
    return null;
  }

  return [conditionId, txHash || "notx", asset || "noasset", timestamp, side, price, size, proxyWallet].join(":");
};

const mapTrade = (
  trade: PolymarketDataTrade,
  sourceProvenance: ReturnType<typeof createProvenance>,
): { conditionId: string; tick: NormalizedExternalTradeTick } | null => {
  const conditionId = trade.conditionId?.trim();
  const price = parseNumber(trade.price);
  const tradedAt = toIsoTimestamp(trade.timestamp);
  const tradeId = buildTradeId(trade);

  if (!conditionId || price === null || !tradedAt || !tradeId) {
    return null;
  }

  return {
    conditionId,
    tick: {
      tradeId,
      outcomeExternalId: trade.asset?.trim() || null,
      side: normalizeSide(trade.side),
      price,
      size: parseNumber(trade.size),
      tradedAt,
      rawJson: trade,
      sourceProvenance,
    },
  };
};

export const fetchPolymarketMarketTrades = async (
  conditionIds: readonly string[],
  limit = 10_000,
): Promise<Map<string, NormalizedExternalTradeTick[]>> => {
  const uniqueConditionIds = [...new Set(conditionIds.map((conditionId) => conditionId.trim()).filter(Boolean))];
  const groupedTrades = new Map<string, NormalizedExternalTradeTick[]>();

  if (uniqueConditionIds.length === 0) {
    return groupedTrades;
  }

  const endpointPath = `/trades?market=${encodeURIComponent(uniqueConditionIds.join(","))}&limit=${Math.min(limit, 10_000)}&offset=0`;
  const response = await fetch(`${DATA_API_BASE_URL}${endpointPath}`, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`polymarket data trades request failed: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("polymarket data trades response was not an array");
  }

  const sourceProvenance = createProvenance("data-api.polymarket.com", endpointPath);

  for (const entry of payload) {
    const mapped = mapTrade(entry as PolymarketDataTrade, sourceProvenance);
    if (!mapped) {
      continue;
    }

    const current = groupedTrades.get(mapped.conditionId) ?? [];
    current.push(mapped.tick);
    groupedTrades.set(mapped.conditionId, current);
  }

  for (const trades of groupedTrades.values()) {
    trades.sort((left, right) => {
      const timestampDelta = new Date(right.tradedAt ?? 0).getTime() - new Date(left.tradedAt ?? 0).getTime();
      if (timestampDelta !== 0) {
        return timestampDelta;
      }
      return right.tradeId.localeCompare(left.tradeId);
    });
  }

  return groupedTrades;
};
