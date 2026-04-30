export type ChartPointSource = "cache" | "gamma" | "clob" | "data_api";

export interface NormalizedPriceHistoryPoint {
  timestamp: string;
  outcome?: string;
  price: number;
  source?: ChartPointSource;
}

export interface NormalizedVolumeHistoryPoint {
  timestamp: string;
  volume: number;
  source?: ChartPointSource;
}

export interface NormalizedLiquidityHistoryPoint {
  timestamp: string;
  liquidity: number;
  source?: ChartPointSource;
}

export interface NormalizedOrderbookDepth {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  updatedAt?: string;
  source?: string;
}

export interface NormalizedRecentTrade {
  timestamp: string;
  price: number;
  size?: number;
  side?: string;
  outcome?: string;
  source?: string;
}

const DEFAULT_LIMIT = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseTimestamp = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseSource = (value: unknown, fallback?: ChartPointSource): ChartPointSource | undefined => {
  if (value === "cache" || value === "gamma" || value === "clob" || value === "data_api") return value;
  return fallback;
};

const getFirst = (record: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const sortAndDedupe = <Point extends { timestamp: string; outcome?: string }>(
  points: Point[],
  limit = DEFAULT_LIMIT,
): Point[] => {
  const byKey = new Map<string, Point>();
  for (const point of points) {
    byKey.set(`${point.timestamp}:${point.outcome ?? ""}`, point);
  }

  return [...byKey.values()]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-limit);
};

const readCandidateArrays = (raw: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

export const normalizeChartPoints = <Point extends { timestamp?: unknown; outcome?: string }>(
  points: unknown,
  mapPoint: (record: Record<string, unknown>, timestamp: string) => Point | null,
  limit = DEFAULT_LIMIT,
): Point[] => {
  const normalized: Point[] = [];
  for (const entry of Array.isArray(points) ? points : []) {
    if (!isRecord(entry)) continue;
    const timestamp = parseTimestamp(getFirst(entry, ["timestamp", "time", "observedAt", "observed_at", "executedAt", "executed_at", "tradedAt", "traded_at", "capturedAt", "captured_at", "updatedAt", "updated_at"]));
    if (!timestamp) continue;
    const point = mapPoint(entry, timestamp);
    if (point) normalized.push({ ...point, timestamp });
  }
  return sortAndDedupe(normalized as Array<Point & { timestamp: string }>, limit) as Point[];
};

export const hasChartData = (points?: unknown[] | null): boolean => Array.isArray(points) && points.length > 0;

export const shouldRenderSparkline = (points?: unknown[] | null): boolean => Array.isArray(points) && points.length >= 2;

export const normalizePriceHistory = (raw: unknown, source?: ChartPointSource, limit = DEFAULT_LIMIT): NormalizedPriceHistoryPoint[] => {
  const entries = readCandidateArrays(raw, ["priceHistory", "price_history", "prices", "history"]);
  const points = normalizeChartPoints(entries, (record, timestamp) => {
    const price = parseNumber(getFirst(record, ["price", "lastTradePrice", "last_trade_price", "lastPrice", "last_price", "value"]));
    if (price === null || price < 0 || price > 1) return null;
    const outcome = getFirst(record, ["outcome", "externalOutcomeId", "external_outcome_id", "tokenId", "token_id"]);
    const parsedSource = parseSource(record.source, source);
    return {
      timestamp,
      ...(outcome === undefined || outcome === null ? {} : { outcome: String(outcome) }),
      price,
      ...(parsedSource ? { source: parsedSource } : {}),
    };
  }, limit);

  if (points.length > 0) return points;
  if (!isRecord(raw)) return [];

  const observedAt = parseTimestamp(getFirst(raw, ["timestamp", "observedAt", "observed_at", "lastSyncedAt", "last_synced_at", "updatedAt", "updated_at"]));
  if (!observedAt) return [];
  const outcomePrices = getFirst(raw, ["outcomePrices", "outcome_prices"]);
  const fromOutcomePrices = Array.isArray(outcomePrices)
    ? outcomePrices.flatMap((entry, index) => {
      const record = isRecord(entry) ? entry : {};
      const price = parseNumber(isRecord(entry) ? getFirst(record, ["price", "lastPrice", "last_price", "value"]) : entry);
      if (price === null || price < 0 || price > 1) return [];
      const outcome = getFirst(record, ["outcome", "externalOutcomeId", "external_outcome_id", "tokenId", "token_id"]) ?? String(index);
      return [{ timestamp: observedAt, outcome: String(outcome), price, ...(source ? { source } : {}) }];
    })
    : [];

  const lastTradePrice = parseNumber(getFirst(raw, ["lastTradePrice", "last_trade_price"]));
  const fromLastTrade = lastTradePrice !== null && lastTradePrice >= 0 && lastTradePrice <= 1
    ? [{ timestamp: observedAt, price: lastTradePrice, ...(source ? { source } : {}) }]
    : [];

  return sortAndDedupe([...fromOutcomePrices, ...fromLastTrade], limit);
};

export const normalizeVolumeHistory = (raw: unknown, source?: ChartPointSource, limit = DEFAULT_LIMIT): NormalizedVolumeHistoryPoint[] =>
  normalizeChartPoints(readCandidateArrays(raw, ["volumeHistory", "volume_history", "volumes", "history"]), (record, timestamp) => {
    const volume = parseNumber(getFirst(record, ["volume", "size", "value"]));
    if (volume === null || volume < 0) return null;
    const parsedSource = parseSource(record.source, source);
    return { timestamp, volume, ...(parsedSource ? { source: parsedSource } : {}) };
  }, limit);

export const normalizeLiquidityHistory = (raw: unknown, source?: ChartPointSource, limit = DEFAULT_LIMIT): NormalizedLiquidityHistoryPoint[] =>
  normalizeChartPoints(readCandidateArrays(raw, ["liquidityHistory", "liquidity_history", "liquidityPoints", "history"]), (record, timestamp) => {
    const liquidity = parseNumber(getFirst(record, ["liquidity", "value"]));
    if (liquidity === null || liquidity < 0) return null;
    const parsedSource = parseSource(record.source, source);
    return { timestamp, liquidity, ...(parsedSource ? { source: parsedSource } : {}) };
  }, limit);

const normalizeBookSide = (levels: unknown): Array<{ price: number; size: number }> =>
  (Array.isArray(levels) ? levels : []).flatMap((level) => {
    const record = isRecord(level) ? level : {};
    const price = parseNumber(getFirst(record, ["price", "p"]));
    const size = parseNumber(getFirst(record, ["size", "quantity", "q"]));
    return price !== null && price >= 0 && price <= 1 && size !== null && size >= 0
      ? [{ price, size }]
      : [];
  });

export const normalizeOrderbookDepth = (raw: unknown): NormalizedOrderbookDepth => {
  const record = isRecord(raw) ? raw : {};
  const bids = normalizeBookSide(getFirst(record, ["bids", "bids_json"]));
  const asks = normalizeBookSide(getFirst(record, ["asks", "asks_json"]));
  const updatedAt = parseTimestamp(getFirst(record, ["updatedAt", "updated_at", "capturedAt", "captured_at", "observedAt", "observed_at"]));
  const source = getFirst(record, ["source", "chartSource", "chart_source"]);
  return {
    bids,
    asks,
    ...(updatedAt ? { updatedAt } : {}),
    ...(typeof source === "string" ? { source } : {}),
  };
};

export const normalizeRecentTrades = (raw: unknown, source?: string, limit = DEFAULT_LIMIT): NormalizedRecentTrade[] =>
  normalizeChartPoints(readCandidateArrays(raw, ["recentTrades", "recent_trades", "trades"]), (record, timestamp) => {
    const price = parseNumber(getFirst(record, ["price", "lastPrice", "last_price", "value"]));
    if (price === null || price < 0 || price > 1) return null;
    const size = parseNumber(getFirst(record, ["size", "quantity", "amount"]));
    const side = getFirst(record, ["side", "takerSide", "taker_side"]);
    const outcome = getFirst(record, ["outcome", "externalOutcomeId", "external_outcome_id", "tokenId", "token_id"]);
    const parsedSource = typeof record.source === "string" ? record.source : source;
    return {
      timestamp,
      price,
      ...(size !== null && size >= 0 ? { size } : {}),
      ...(typeof side === "string" ? { side } : {}),
      ...(outcome === undefined || outcome === null ? {} : { outcome: String(outcome) }),
      ...(parsedSource ? { source: parsedSource } : {}),
    };
  }, limit);
