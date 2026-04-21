import { normalizeApiPayload } from "./api-serialization";

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
  price: string | number;
  size: string | number | null;
  traded_at: string;
}

const toNumber = (value: string | number | null): number | null => {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapExternalMarket = (row: ExternalMarketRow) => ({
  id: row.id,
  source: row.source,
  externalId: row.external_id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: row.status,
  marketUrl: row.market_url,
  closeTime: row.close_time,
  endTime: row.end_time,
  resolvedAt: row.resolved_at,
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
  lastTradePrice: toNumber(row.last_trade_price),
  volume24h: toNumber(row.volume_24h),
  volumeTotal: toNumber(row.volume_total),
  lastSyncedAt: row.last_synced_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  outcomes: [] as ReturnType<typeof mapExternalOutcome>[],
  recentTrades: [] as ReturnType<typeof mapExternalTrade>[],
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
  price: toNumber(row.price),
  size: toNumber(row.size),
  tradedAt: row.traded_at,
});

export async function readExternalMarkets(supabase: {
  from: (table: string) => unknown;
}) {
  const { data: marketRows, error: marketError } = await (supabase.from("external_markets") as {
    select: (columns: string) => {
      order: (column: string, options?: Record<string, unknown>) => {
        order: (column: string, options?: Record<string, unknown>) => {
          limit: (count: number) => Promise<{ data: ExternalMarketRow[] | null; error: Error | null }>;
        };
      };
    };
  })
    .select(
      "id, source, external_id, slug, title, description, status, market_url, close_time, end_time, resolved_at, best_bid, best_ask, last_trade_price, volume_24h, volume_total, last_synced_at, created_at, updated_at",
    )
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (marketError) {
    throw marketError;
  }

  if (!marketRows?.length) {
    return [];
  }

  const marketIds = marketRows.map((market) => market.id);
  const [outcomeResult, tradeResult] = await Promise.all([
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
      .in("external_market_id", marketIds)
      .order("outcome_index", { ascending: true }),
    (supabase.from("external_trade_ticks") as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => {
          order: (column: string, options?: Record<string, unknown>) => Promise<{ data: ExternalTradeRow[] | null; error: Error | null }>;
        };
      };
    })
      .select("external_market_id, external_trade_id, external_outcome_id, side, price, size, traded_at")
      .in("external_market_id", marketIds)
      .order("traded_at", { ascending: false }),
  ]);

  if (outcomeResult.error) {
    throw outcomeResult.error;
  }

  if (tradeResult.error) {
    throw tradeResult.error;
  }

  const markets = marketRows.map(mapExternalMarket);
  const byId = new Map(markets.map((market) => [market.id, market]));

  for (const outcome of outcomeResult.data ?? []) {
    byId.get(outcome.external_market_id)?.outcomes.push(mapExternalOutcome(outcome));
  }

  const tradeCounts = new Map<string, number>();
  for (const trade of tradeResult.data ?? []) {
    const current = tradeCounts.get(trade.external_market_id) ?? 0;
    if (current >= 20) {
      continue;
    }

    byId.get(trade.external_market_id)?.recentTrades.push(mapExternalTrade(trade));
    tradeCounts.set(trade.external_market_id, current + 1);
  }

  return normalizeApiPayload(markets);
}
