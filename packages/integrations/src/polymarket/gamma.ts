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

export interface FetchPolymarketGammaEventMarketsPageOptions {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  order?: string;
  ascending?: boolean;
  timeoutMs?: number;
}

export interface PolymarketGammaEventMarketsPage {
  records: PolymarketGammaRecord[];
  rawCount: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
  endpointPath: string;
}

export interface FetchAllPolymarketGammaEventMarketsOptions {
  pageSize?: number;
  offset?: number;
  maxPages?: number;
  maxMarkets?: number;
  active?: boolean;
  closed?: boolean;
  order?: string;
  ascending?: boolean;
  timeoutMs?: number;
  dedupe?: boolean;
}

export interface FetchAllPolymarketGammaEventMarketsResult {
  records: PolymarketGammaRecord[];
  pagesFetched: number;
  rawRecordsSeen: number;
  uniqueMarkets: number;
  maxPagesReached: boolean;
  maxMarketsReached: boolean;
  startOffset: number;
  nextOffset: number | null;
}

const clampInteger = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
};

const fetchGammaPayload = async (
  endpoint: string,
  timeoutMs: number,
  options: { allowNotFound?: boolean } = {},
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (options.allowNotFound && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`polymarket gamma request failed: ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
};

const mapGammaMarketPayload = (payload: unknown, endpointPath: string): PolymarketGammaRecord | null => {
  if (!payload || typeof payload !== "object") return null;
  const provenance = createProvenance("gamma-api.polymarket.com", endpointPath);
  const market = normalizePolymarketMarket(payload as PolymarketMarket);
  return market ? { rawJson: payload, market, provenance } : null;
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
  const page = await fetchPolymarketGammaEventMarketsPage(options);
  return page.records;
};

export const fetchPolymarketGammaEventMarketsPage = async (
  options: FetchPolymarketGammaEventMarketsPageOptions = {},
): Promise<PolymarketGammaEventMarketsPage> => {
  const limit = clampInteger(options.limit ?? 100, 1, 500);
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const params = new URLSearchParams();
  params.set("active", String(options.active ?? true));
  params.set("closed", String(options.closed ?? false));
  params.set("order", options.order ?? "volume_24hr");
  params.set("ascending", String(options.ascending ?? false));
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const endpointPath = `/events?${params.toString()}`;
  const payload = await fetchGammaPayload(
    `${GAMMA_BASE_URL}${endpointPath}`,
    options.timeoutMs ?? DEFAULT_GAMMA_TIMEOUT_MS,
  );

  if (!Array.isArray(payload)) {
    throw new Error("polymarket gamma events response was not an array");
  }

  return {
    records: mapGammaEventsPayload(payload, endpointPath),
    rawCount: payload.length,
    limit,
    offset,
    nextOffset: payload.length === 0 || payload.length < limit ? null : offset + limit,
    endpointPath,
  };
};

export const fetchAllPolymarketGammaEventMarkets = async (
  options: FetchAllPolymarketGammaEventMarketsOptions = {},
): Promise<FetchAllPolymarketGammaEventMarketsResult> => {
  const pageSize = clampInteger(options.pageSize ?? 100, 1, 500);
  const maxPages = clampInteger(options.maxPages ?? 50, 1, Number.MAX_SAFE_INTEGER);
  const maxMarkets = clampInteger(options.maxMarkets ?? 5_000, 1, Number.MAX_SAFE_INTEGER);
  const startOffset = Math.max(0, Math.trunc(options.offset ?? 0));
  const dedupe = options.dedupe ?? true;
  const records: PolymarketGammaRecord[] = [];
  const seenExternalIds = new Set<string>();
  let pagesFetched = 0;
  let rawRecordsSeen = 0;
  let offset = startOffset;
  let nextOffset: number | null = startOffset;
  let maxPagesReached = false;
  let maxMarketsReached = false;

  while (nextOffset !== null && pagesFetched < maxPages && records.length < maxMarkets) {
    const page = await fetchPolymarketGammaEventMarketsPage({
      active: options.active ?? true,
      closed: options.closed ?? false,
      order: options.order ?? "volume_24hr",
      ascending: options.ascending ?? false,
      timeoutMs: options.timeoutMs,
      limit: pageSize,
      offset,
    });

    pagesFetched += 1;
    rawRecordsSeen += page.records.length;

    for (const record of page.records) {
      if (dedupe && seenExternalIds.has(record.market.externalId)) {
        continue;
      }
      seenExternalIds.add(record.market.externalId);
      records.push(record);
      if (records.length >= maxMarkets) {
        break;
      }
    }

    maxMarketsReached = records.length >= maxMarkets;
    nextOffset = maxMarketsReached ? page.nextOffset : page.nextOffset;
    offset = page.nextOffset ?? offset;
    if (page.nextOffset === null) {
      break;
    }
  }

  if (nextOffset !== null && pagesFetched >= maxPages) {
    maxPagesReached = true;
  }

  return {
    records,
    pagesFetched,
    rawRecordsSeen,
    uniqueMarkets: seenExternalIds.size || records.length,
    maxPagesReached,
    maxMarketsReached,
    startOffset,
    nextOffset,
  };
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

export const fetchPolymarketGammaMarketBySlug = async (
  slug: string,
  options: Omit<FetchPolymarketGammaMarketsOptions, "slug"> = {},
): Promise<PolymarketGammaRecord | null> => {
  const endpointPath = `/markets/slug/${encodeURIComponent(slug)}`;
  const payload = await fetchGammaPayload(
    `${GAMMA_BASE_URL}${endpointPath}`,
    options.timeoutMs ?? DEFAULT_GAMMA_TIMEOUT_MS,
    { allowNotFound: true },
  );
  return mapGammaMarketPayload(payload, endpointPath);
};

export const fetchPolymarketGammaEventMarketBySlug = async (
  slug: string,
  options: Omit<FetchPolymarketGammaMarketsOptions, "slug"> = {},
): Promise<PolymarketGammaRecord | null> => {
  const endpointPath = `/events/slug/${encodeURIComponent(slug)}`;
  const payload = await fetchGammaPayload(
    `${GAMMA_BASE_URL}${endpointPath}`,
    options.timeoutMs ?? DEFAULT_GAMMA_TIMEOUT_MS,
    { allowNotFound: true },
  );
  return mapGammaEventsPayload(payload ? [payload] : [], endpointPath)[0] ?? null;
};
