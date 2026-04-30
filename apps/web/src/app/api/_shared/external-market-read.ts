import { resolvePolymarketMarketStatus } from "@bet/integrations";

import { normalizeApiPayload } from "./api-serialization";
import {
  normalizeLiquidityHistory,
  normalizeOrderbookDepth,
  normalizePriceHistory,
  normalizeRecentTrades,
  normalizeVolumeHistory,
} from "./chart-history";
import type { PublicExternalMarketRecord } from "./polymarket-gamma-fallback";

interface ExternalMarketRow {
  id: string;
  source: "polymarket" | "kalshi";
  external_id: string;
  slug: string;
  title: string;
  description: string;
  status: "open" | "closed" | "resolved" | "cancelled";
  market_url: string | null;
  close_time: string | null;
  end_time: string | null;
  resolved_at: string | null;
  best_bid: string | number | null;
  best_ask: string | number | null;
  last_trade_price: string | number | null;
  volume_24h: string | number | null;
  volume_total: string | number | null;
  raw_json?: unknown;
  source_provenance?: unknown;
  last_seen_at?: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ExternalOutcomeRow {
  external_market_id: string;
  external_outcome_id: string;
  title: string;
  slug: string;
  outcome_index: number;
  yes_no: "yes" | "no" | null;
  best_bid: string | number | null;
  best_ask: string | number | null;
  last_price: string | number | null;
  volume: string | number | null;
}

interface ExternalTradeRow {
  external_market_id: string;
  external_trade_id: string;
  external_outcome_id: string | null;
  side: "buy" | "sell" | null;
  price: string | number | null;
  price_ppm?: string | number | null;
  size: string | number | null;
  size_atoms?: string | number | null;
  traded_at: string;
  executed_at?: string | null;
  raw_json?: unknown;
  source_provenance?: unknown;
}

interface ExternalOrderbookSnapshotRow {
  external_market_id: string;
  external_outcome_id: string;
  bids_json: unknown;
  asks_json: unknown;
  captured_at: string;
  last_trade_price: string | number | null;
  best_bid: string | number | null;
  best_ask: string | number | null;
  raw_json?: unknown;
  source_provenance?: unknown;
}

interface ExternalMarketPriceRow {
  market_id: string;
  source: "polymarket" | "kalshi";
  observed_at: string;
  outcome_prices: unknown;
  best_bid: string | number | null;
  best_ask: string | number | null;
  last_trade_price: string | number | null;
  volume: string | number | null;
  liquidity: string | number | null;
  raw_json?: unknown;
  source_provenance?: unknown;
}

const toNumber = (value: string | number | null): number | null => {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapExternalMarketStatus = (row: ExternalMarketRow): ExternalMarketRow["status"] =>
  row.source === "polymarket"
    ? resolvePolymarketMarketStatus({
      status: row.status,
      closeTime: row.close_time ?? undefined,
      endDate: row.end_time ?? undefined,
      resolvedAt: row.resolved_at ?? undefined,
    })
    : row.status;

const mapExternalMarket = (row: ExternalMarketRow): PublicExternalMarketRecord => ({
  id: row.id,
  source: row.source,
  externalId: row.external_id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: mapExternalMarketStatus(row),
  marketUrl: row.market_url,
  closeTime: row.close_time,
  endTime: row.end_time,
  resolvedAt: row.resolved_at,
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
  lastTradePrice: toNumber(row.last_trade_price),
  volume24h: toNumber(row.volume_24h),
  volumeTotal: toNumber(row.volume_total),
  liquidity: toNumber(row.volume_total),
  provenance: row.source_provenance ?? {
    source: row.source,
    upstream: "external_markets",
    fetchedAt: row.last_synced_at ?? row.updated_at,
  },
  sourceProvenance: row.source_provenance ?? {
    source: row.source,
    upstream: "external_markets",
    fetchedAt: row.last_synced_at ?? row.updated_at,
  },
  lastSyncedAt: row.last_synced_at,
  lastUpdatedAt: row.last_seen_at ?? row.last_synced_at ?? row.updated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  outcomes: [] as ReturnType<typeof mapExternalOutcome>[],
  recentTrades: [] as ReturnType<typeof mapExternalTrade>[],
  latestOrderbook: [],
  ...(normalizePriceHistory(row.raw_json, "cache", 100).length ? { priceHistory: normalizePriceHistory(row.raw_json, "cache", 100) } : {}),
  ...(normalizeVolumeHistory(row.raw_json, "cache", 100).length ? { volumeHistory: normalizeVolumeHistory(row.raw_json, "cache", 100) } : {}),
  ...(normalizeLiquidityHistory(row.raw_json, "cache", 100).length ? { liquidityHistory: normalizeLiquidityHistory(row.raw_json, "cache", 100) } : {}),
  spread: toNumber(row.best_bid) !== null && toNumber(row.best_ask) !== null ? Math.max(0, toNumber(row.best_ask)! - toNumber(row.best_bid)!) : null,
});

const mapExternalOutcome = (row: ExternalOutcomeRow) => ({
  externalOutcomeId: row.external_outcome_id,
  title: row.title,
  slug: row.slug,
  index: row.outcome_index,
  yesNo: row.yes_no,
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
  lastPrice: toNumber(row.last_price),
  volume: toNumber(row.volume),
});

const mapExternalTrade = (row: ExternalTradeRow) => ({
  externalTradeId: row.external_trade_id,
  externalOutcomeId: row.external_outcome_id,
  side: row.side,
  price: (() => {
    const pricePpm = toNumber(row.price_ppm ?? null);
    return pricePpm === null ? toNumber(row.price) : pricePpm / 1_000_000;
  })(),
  size: (() => {
    const sizeAtoms = toNumber(row.size_atoms ?? null);
    return sizeAtoms === null ? toNumber(row.size) : sizeAtoms / 1_000_000;
  })(),
  tradedAt: row.executed_at ?? row.traded_at,
});

const mapNormalizedTrade = (row: ExternalTradeRow) => normalizeRecentTrades([{
  timestamp: row.executed_at ?? row.traded_at,
  price: row.price_ppm === undefined || row.price_ppm === null ? row.price : toNumber(row.price_ppm) === null ? row.price : toNumber(row.price_ppm)! / 1_000_000,
  size: row.size_atoms === undefined || row.size_atoms === null ? row.size : toNumber(row.size_atoms) === null ? row.size : toNumber(row.size_atoms)! / 1_000_000,
  side: row.side,
  outcome: row.external_outcome_id,
  source: row.source_provenance && typeof row.source_provenance === "object" && (row.source_provenance as Record<string, unknown>).upstream === "data-api.polymarket.com" ? "data_api" : "cache",
}], "cache", 1)[0] ?? null;

const mapExternalOrderbookSnapshot = (row: ExternalOrderbookSnapshotRow) => ({
  externalOutcomeId: row.external_outcome_id,
  bids: row.bids_json,
  asks: row.asks_json,
  capturedAt: row.captured_at,
  lastTradePrice: toNumber(row.last_trade_price),
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
});

const EXTERNAL_MARKET_CHILD_QUERY_BATCH_SIZE = 50;

const chunk = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

export async function readExternalMarkets(supabase: {
  from: (table: string) => unknown;
}) {
  let marketRows: ExternalMarketRow[] | null = null;
  const { data, error: marketError } = await (supabase.from("external_markets") as {
    select: (columns: string) => {
      order: (column: string, options?: Record<string, unknown>) => {
        order: (column: string, options?: Record<string, unknown>) => {
          limit: (count: number) => Promise<{ data: ExternalMarketRow[] | null; error: Error | null }>;
        };
      };
    };
  })
    .select(
      "id, source, external_id, slug, title, description, status, market_url, close_time, end_time, resolved_at, best_bid, best_ask, last_trade_price, volume_24h, volume_total, raw_json, source_provenance, last_seen_at, last_synced_at, created_at, updated_at",
    )
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (marketError) {
    throw marketError;
  }

  marketRows = data;

  if (!marketRows?.length) {
    return normalizeApiPayload([]);
  }

  const marketIds = marketRows.map((market) => market.id);
  const outcomeRows: ExternalOutcomeRow[] = [];
  const tradeRows: ExternalTradeRow[] = [];
  const orderbookRows: ExternalOrderbookSnapshotRow[] = [];
  const priceRows: ExternalMarketPriceRow[] = [];

  for (const batch of chunk(marketIds, EXTERNAL_MARKET_CHILD_QUERY_BATCH_SIZE)) {
    const [outcomeResult, tradeResult, priceResult] = await Promise.all([
      (supabase.from("external_outcomes") as {
        select: (columns: string) => {
          in: (column: string, values: string[]) => {
            order: (column: string, options?: Record<string, unknown>) => Promise<{ data: ExternalOutcomeRow[] | null; error: Error | null }>;
          };
        };
      })
        .select(
          "external_market_id, external_outcome_id, title, slug, outcome_index, yes_no, best_bid, best_ask, last_price, volume",
        )
        .in("external_market_id", batch)
        .order("outcome_index", { ascending: true }),
      (supabase.from("external_trade_ticks") as {
        select: (columns: string) => {
          in: (column: string, values: string[]) => {
            order: (column: string, options?: Record<string, unknown>) => Promise<{ data: ExternalTradeRow[] | null; error: Error | null }>;
          };
        };
      })
        .select("external_market_id, external_trade_id, external_outcome_id, side, price, price_ppm, size, size_atoms, traded_at, executed_at, raw_json, source_provenance")
        .in("external_market_id", batch)
        .order("traded_at", { ascending: false }),
      (async () => {
        try {
          return await (supabase.from("external_market_prices") as {
            select: (columns: string) => {
              in: (column: string, values: string[]) => {
                order: (column: string, options?: Record<string, unknown>) => Promise<{ data: ExternalMarketPriceRow[] | null; error: Error | null }>;
              };
            };
          })
            .select("market_id, source, observed_at, outcome_prices, best_bid, best_ask, last_trade_price, volume, liquidity, raw_json, source_provenance")
            .in("market_id", batch)
            .order("observed_at", { ascending: false });
        } catch (error) {
          return { data: null, error: error instanceof Error ? error : new Error("external_market_prices read failed") };
        }
      })(),
    ]);

    const orderbookResult = await (async () => {
      try {
        return await (supabase.from("external_orderbook_snapshots") as {
          select: (columns: string) => {
            in: (column: string, values: string[]) => {
              order: (column: string, options?: Record<string, unknown>) => Promise<{ data: ExternalOrderbookSnapshotRow[] | null; error: Error | null }>;
            };
          };
        })
          .select("external_market_id, external_outcome_id, bids_json, asks_json, captured_at, last_trade_price, best_bid, best_ask, raw_json, source_provenance")
          .in("external_market_id", batch)
          .order("captured_at", { ascending: false });
      } catch (error) {
        return { data: null, error: error instanceof Error ? error : new Error("external_orderbook_snapshots read failed") };
      }
    })();

    if (outcomeResult.error) {
      throw outcomeResult.error;
    }

    if (tradeResult.error) {
      throw tradeResult.error;
    }

    if (priceResult.error) {
      console.warn("external_market_prices read failed; continuing without price chart history", priceResult.error);
    }

    if (orderbookResult.error) {
      console.warn("external_orderbook_snapshots read failed; continuing without orderbook snapshots", orderbookResult.error);
    }

    outcomeRows.push(...(outcomeResult.data ?? []));
    tradeRows.push(...(tradeResult.data ?? []));
    orderbookRows.push(...(orderbookResult.data ?? []));
    priceRows.push(...(priceResult.data ?? []));
  }

  const markets = marketRows.map(mapExternalMarket);
  const byId = new Map(markets.map((market) => [market.id, market]));
  const outcomeByMarketAndExternalId = new Map<string, ReturnType<typeof mapExternalOutcome>>();

  for (const outcome of outcomeRows) {
    const market = byId.get(outcome.external_market_id);
    if (!market) {
      continue;
    }

    const mapped = mapExternalOutcome(outcome);
    market.outcomes.push(mapped);
    outcomeByMarketAndExternalId.set(`${outcome.external_market_id}:${outcome.external_outcome_id}`, mapped);
  }

  const tradeCounts = new Map<string, number>();
  const latestTradeByMarket = new Set<string>();
  const latestTradeByOutcome = new Set<string>();
  for (const trade of tradeRows) {
    const market = byId.get(trade.external_market_id);
    const mappedTrade = mapExternalTrade(trade);
    if (market && !latestTradeByMarket.has(trade.external_market_id)) {
      market.lastTradePrice = mappedTrade.price;
      latestTradeByMarket.add(trade.external_market_id);
    }

    if (trade.external_outcome_id) {
      const outcomeKey = `${trade.external_market_id}:${trade.external_outcome_id}`;
      const outcome = outcomeByMarketAndExternalId.get(outcomeKey);
      if (outcome && !latestTradeByOutcome.has(outcomeKey)) {
        outcome.lastPrice = mappedTrade.price;
        latestTradeByOutcome.add(outcomeKey);
      }
    }

    const current = tradeCounts.get(trade.external_market_id) ?? 0;
    if (current >= 20) {
      continue;
    }

    market?.recentTrades.push(mappedTrade);
    const normalizedTrade = mapNormalizedTrade(trade);
    if (market && normalizedTrade) {
      market.normalizedRecentTrades = [...(market.normalizedRecentTrades ?? []), normalizedTrade].slice(0, 100);
    }
    tradeCounts.set(trade.external_market_id, current + 1);
  }

  const priceRowsByMarket = new Map<string, ExternalMarketPriceRow[]>();
  for (const row of priceRows) {
    const rows = priceRowsByMarket.get(row.market_id) ?? [];
    rows.push(row);
    priceRowsByMarket.set(row.market_id, rows);
  }

  for (const [marketId, rows] of priceRowsByMarket) {
    const market = byId.get(marketId);
    if (!market) continue;
    const rawRows = rows.map((row) => ({
      timestamp: row.observed_at,
      outcomePrices: row.outcome_prices,
      lastTradePrice: row.last_trade_price,
      volume: row.volume,
      liquidity: row.liquidity,
      source: row.source === "polymarket" ? "cache" : "cache",
    }));
    const priceHistory = normalizePriceHistory(rawRows, "cache", 100);
    const volumeHistory = normalizeVolumeHistory(rawRows, "cache", 100);
    const liquidityHistory = normalizeLiquidityHistory(rawRows, "cache", 100);
    if (priceHistory.length > 0) market.priceHistory = priceHistory;
    if (volumeHistory.length > 0) market.volumeHistory = volumeHistory;
    if (liquidityHistory.length > 0) market.liquidityHistory = liquidityHistory;
    const chartUpdatedAt = [
      market.chartUpdatedAt,
      priceHistory.at(-1)?.timestamp,
      volumeHistory.at(-1)?.timestamp,
      liquidityHistory.at(-1)?.timestamp,
    ].filter(Boolean).sort().at(-1);
    if (chartUpdatedAt) {
      market.chartUpdatedAt = chartUpdatedAt;
      market.chartSource = "cache";
    }
  }

  const latestOrderbookByOutcome = new Set<string>();
  for (const snapshot of orderbookRows) {
    const key = `${snapshot.external_market_id}:${snapshot.external_outcome_id}`;
    if (latestOrderbookByOutcome.has(key)) {
      continue;
    }

    const market = byId.get(snapshot.external_market_id);
    market?.latestOrderbook.push(mapExternalOrderbookSnapshot(snapshot));
    if (market) {
      const normalizedBook = normalizeOrderbookDepth({
        bids: snapshot.bids_json,
        asks: snapshot.asks_json,
        capturedAt: snapshot.captured_at,
        source: "clob",
      });
      if (normalizedBook.bids.length > 0 || normalizedBook.asks.length > 0) {
        market.orderbookDepth = normalizedBook;
      }
    }
    latestOrderbookByOutcome.add(key);
  }

  return normalizeApiPayload(markets);
}

export async function readExternalMarketBySourceAndId(
  supabase: { from: (table: string) => unknown },
  source: string,
  externalId: string,
) {
  const normalizedId = decodeURIComponent(externalId).toLowerCase();
  const markets = (await readExternalMarkets(supabase)) as PublicExternalMarketRecord[];

  return markets.find((market) =>
    market.source === source &&
    (
      market.externalId.toLowerCase() === normalizedId ||
      market.slug.toLowerCase() === normalizedId ||
      market.id.toLowerCase() === normalizedId
    )
  ) ?? null;
}
