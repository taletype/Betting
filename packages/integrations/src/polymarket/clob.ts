import { createProvenance } from "./provenance";
import type { PolymarketBookPayload } from "./types";

const CLOB_BASE_URL = "https://clob.polymarket.com";

export interface PolymarketOrderBookSnapshot {
  tokenId: string;
  tickSize: string | null;
  minOrderSize: string | null;
  bidsJson: unknown;
  asksJson: unknown;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  capturedAt: string;
  rawJson: unknown;
  provenance: ReturnType<typeof createProvenance>;
}

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const fetchPolymarketOrderBook = async (tokenId: string): Promise<PolymarketOrderBookSnapshot> => {
  const endpointPath = `/book?token_id=${encodeURIComponent(tokenId)}`;
  const response = await fetch(`${CLOB_BASE_URL}${endpointPath}`, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`polymarket clob request failed for ${tokenId}: ${response.status}`);
  }

  const payload = (await response.json()) as PolymarketBookPayload;
  const bids = Array.isArray(payload.bids) ? payload.bids : [];
  const asks = Array.isArray(payload.asks) ? payload.asks : [];

  return {
    tokenId,
    tickSize: payload.tick_size === undefined ? null : String(payload.tick_size),
    minOrderSize: payload.min_order_size === undefined ? null : String(payload.min_order_size),
    bidsJson: bids,
    asksJson: asks,
    bestBid: parseNumber(bids[0]?.price),
    bestAsk: parseNumber(asks[0]?.price),
    lastTradePrice: null,
    capturedAt: new Date().toISOString(),
    rawJson: payload,
    provenance: createProvenance("clob.polymarket.com", endpointPath),
  };
};
