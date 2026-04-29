import type { NormalizedExternalMarket } from "../index";
import { createProvenance } from "./provenance";
import { normalizePolymarketMarket } from "./normalize";
import type { PolymarketMarket } from "./types";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_GAMMA_TIMEOUT_MS = 3_500;

export interface PolymarketGammaRecord {
  market: NormalizedExternalMarket;
  rawJson: unknown;
  provenance: ReturnType<typeof createProvenance>;
}

export interface FetchPolymarketGammaMarketsOptions {
  slug?: string;
  limit?: number;
  timeoutMs?: number;
}

const fetchGammaPayload = async (
  endpoint: string,
  timeoutMs: number,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`polymarket gamma request failed: ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
};

const mapGammaPayload = (payload: unknown, endpointPath: string): PolymarketGammaRecord[] => {
  if (!Array.isArray(payload)) {
    throw new Error("polymarket gamma response was not an array");
  }

  const provenance = createProvenance("gamma-api.polymarket.com", endpointPath);

  return payload
    .map((entry) => ({
      rawJson: entry,
      market: normalizePolymarketMarket(entry as PolymarketMarket),
    }))
    .filter((entry): entry is { rawJson: unknown; market: NormalizedExternalMarket } => entry.market !== null)
    .map((entry) => ({ ...entry, provenance }));
};

export const fetchPolymarketGammaMarkets = async (
  options: FetchPolymarketGammaMarketsOptions = {},
): Promise<PolymarketGammaRecord[]> => {
  const params = new URLSearchParams();
  if (options.slug) {
    params.set("slug", options.slug);
  } else {
    params.set("active", "true");
    params.set("closed", "false");
    params.set("limit", String(options.limit ?? 200));
  }

  const endpointPath = `/markets?${params.toString()}`;
  const payload = await fetchGammaPayload(
    `${GAMMA_BASE_URL}${endpointPath}`,
    options.timeoutMs ?? DEFAULT_GAMMA_TIMEOUT_MS,
  );

  return mapGammaPayload(payload, endpointPath);
};

export const fetchPolymarketGammaMarketBySlugOrId = async (
  slugOrId: string,
  options: Omit<FetchPolymarketGammaMarketsOptions, "slug"> = {},
): Promise<PolymarketGammaRecord | null> => {
  const normalized = decodeURIComponent(slugOrId).toLowerCase();
  const records = await fetchPolymarketGammaMarkets({
    ...options,
    slug: slugOrId,
  });

  return records.find(({ market }) =>
    market.slug.toLowerCase() === normalized ||
    market.externalId.toLowerCase() === normalized
  ) ?? records[0] ?? null;
};
