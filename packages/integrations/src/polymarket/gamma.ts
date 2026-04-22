import type { NormalizedExternalMarket } from "../index";
import { createProvenance } from "./provenance";
import { normalizePolymarketMarket } from "./normalize";
import type { PolymarketMarket } from "./types";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

export interface PolymarketGammaRecord {
  market: NormalizedExternalMarket;
  rawJson: unknown;
  provenance: ReturnType<typeof createProvenance>;
}

export const fetchPolymarketGammaMarkets = async (): Promise<PolymarketGammaRecord[]> => {
  const endpoint = `${GAMMA_BASE_URL}/markets?active=true&closed=false&limit=200`;
  const response = await fetch(endpoint, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`polymarket gamma request failed: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("polymarket gamma response was not an array");
  }

  const provenance = createProvenance("gamma-api.polymarket.com", "/markets?active=true&closed=false&limit=200");

  return payload
    .map((entry) => ({
      rawJson: entry,
      market: normalizePolymarketMarket(entry as PolymarketMarket),
    }))
    .filter((entry): entry is { rawJson: unknown; market: NormalizedExternalMarket } => entry.market !== null)
    .map((entry) => ({ ...entry, provenance }));
};
