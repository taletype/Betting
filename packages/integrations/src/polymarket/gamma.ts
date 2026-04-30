import type { NormalizedExternalMarket } from "../index";
import { createProvenance } from "./provenance";
import { normalizePolymarketMarket } from "./normalize";
import type { PolymarketEvent, PolymarketMarket } from "./types";

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

const withEventDefaults = (event: PolymarketEvent, market?: PolymarketMarket): PolymarketMarket => ({
  ...market,
  id: market?.id ?? event.id,
  slug: market?.slug ?? event.slug,
  question: market?.question ?? event.question ?? event.title,
  description: market?.description ?? event.description ?? "",
  active: market?.active ?? event.active,
  closed: market?.closed ?? event.closed,
  endDate: market?.endDate ?? event.endDate,
  end_date_iso: market?.end_date_iso ?? event.end_date_iso,
  closedTime: market?.closedTime ?? event.closedTime,
  resolved_at: market?.resolved_at ?? event.resolved_at,
  volume: market?.volume ?? event.volume,
  volume24hr: market?.volume24hr ?? event.volume24hr,
  url: market?.url ?? (event.slug ? `https://polymarket.com/event/${event.slug}` : undefined),
});

const mapGammaEventsPayload = (payload: unknown, endpointPath: string): PolymarketGammaRecord[] => {
  if (!Array.isArray(payload)) {
    throw new Error("polymarket gamma events response was not an array");
  }

  const provenance = createProvenance("gamma-api.polymarket.com", endpointPath);
  const records: PolymarketGammaRecord[] = [];

  for (const entry of payload) {
    const event = entry as PolymarketEvent;
    const eventMarkets = Array.isArray(event.markets) && event.markets.length > 0
      ? event.markets.map((market) => withEventDefaults(event, market))
      : [withEventDefaults(event)];

    for (const marketPayload of eventMarkets) {
      const market = normalizePolymarketMarket(marketPayload);
      if (market) {
        records.push({ rawJson: entry, market, provenance });
      }
    }
  }

  return records;
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

export const fetchPolymarketGammaEventMarkets = async (
  options: Omit<FetchPolymarketGammaMarketsOptions, "slug"> = {},
): Promise<PolymarketGammaRecord[]> => {
  const params = new URLSearchParams();
  params.set("active", "true");
  params.set("closed", "false");
  params.set("order", "volume_24hr");
  params.set("ascending", "false");
  params.set("limit", String(options.limit ?? 50));

  const endpointPath = `/events?${params.toString()}`;
  const payload = await fetchGammaPayload(
    `${GAMMA_BASE_URL}${endpointPath}`,
    options.timeoutMs ?? DEFAULT_GAMMA_TIMEOUT_MS,
  );

  return mapGammaEventsPayload(payload, endpointPath);
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
