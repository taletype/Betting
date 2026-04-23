import { createDatabaseClient, type DatabaseExecutor } from "@bet/db";

interface ExternalMarketRow {
  id: string;
  source: "polymarket" | "kalshi";
  external_id: string;
  slug: string;
  title: string;
  description: string;
  status: "open" | "closed" | "resolved" | "cancelled";
  market_url: string | null;
  close_time: Date | string | null;
  end_time: Date | string | null;
  resolved_at: Date | string | null;
  best_bid: number | string | null;
  best_ask: number | string | null;
  last_trade_price: number | string | null;
  volume_24h: number | string | null;
  volume_total: number | string | null;
  last_synced_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ExternalOutcomeRow {
  external_market_id: string;
  external_outcome_id: string;
  title: string;
  slug: string;
  outcome_index: number;
  yes_no: "yes" | "no" | null;
  best_bid: number | string | null;
  best_ask: number | string | null;
  last_price: number | string | null;
  volume: number | string | null;
}

interface ExternalOrderbookSnapshotRow {
  external_market_id: string;
  external_outcome_id: string;
  bids_json: unknown;
  asks_json: unknown;
  captured_at: Date | string;
  last_trade_price: number | string | null;
  best_bid: number | string | null;
  best_ask: number | string | null;
}

interface ExternalTradeRow {
  external_market_id: string;
  external_trade_id: string;
  external_outcome_id: string | null;
  source: "polymarket" | "kalshi";
  side: "buy" | "sell" | null;
  price_ppm: bigint | number | string | null;
  size_atoms: bigint | number | string | null;
  executed_at: Date | string;
}

const defaultDb = createDatabaseClient();

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIsoString = (value: Date | string | null): string | null =>
  value ? toIsoString(value) : null;

const toNumber = (value: string | number | null): number | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBigIntString = (value: bigint | number | string | null): string | null => {
  if (value === null) {
    return null;
  }

  return typeof value === "bigint" ? value.toString() : String(value);
};

const ppmToPrice = (value: bigint | number | string | null): number | null => {
  const asNumber = toNumber(typeof value === "bigint" ? Number(value) : value);
  return asNumber === null ? null : asNumber / 1_000_000;
};

const atomsToSize = (value: bigint | number | string | null): number | null => {
  const asNumber = toNumber(typeof value === "bigint" ? Number(value) : value);
  return asNumber === null ? null : asNumber / 1_000_000;
};

export interface ExternalOutcomeView {
  externalOutcomeId: string;
  title: string;
  slug: string;
  index: number;
  yesNo: "yes" | "no" | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastPrice: number | null;
  volume: number | null;
}

export interface ExternalTradeView {
  externalTradeId: string;
  externalOutcomeId: string | null;
  side: "buy" | "sell" | null;
  price: number | null;
  size: number | null;
  tradedAt: string;
}

export interface ExternalImportedTradeView {
  externalTradeId: string;
  externalOutcomeId: string | null;
  source: "polymarket" | "kalshi";
  side: "buy" | "sell" | null;
  price: number | null;
  pricePpm: string | null;
  size: number | null;
  sizeAtoms: string | null;
  executedAt: string;
}

export interface ExternalOrderbookSnapshotView {
  externalOutcomeId: string;
  bids: unknown;
  asks: unknown;
  capturedAt: string;
  lastTradePrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
}

export interface ExternalMarketView {
  id: string;
  source: "polymarket" | "kalshi";
  externalId: string;
  slug: string;
  title: string;
  description: string;
  status: "open" | "closed" | "resolved" | "cancelled";
  marketUrl: string | null;
  closeTime: string | null;
  endTime: string | null;
  resolvedAt: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  volume24h: number | null;
  volumeTotal: number | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  outcomes: ExternalOutcomeView[];
  recentTrades: ExternalTradeView[];
  latestOrderbook: ExternalOrderbookSnapshotView[];
}

const mapMarket = (row: ExternalMarketRow): ExternalMarketView => ({
  id: row.id,
  source: row.source,
  externalId: row.external_id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: row.status,
  marketUrl: row.market_url,
  closeTime: toNullableIsoString(row.close_time),
  endTime: toNullableIsoString(row.end_time),
  resolvedAt: toNullableIsoString(row.resolved_at),
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
  lastTradePrice: toNumber(row.last_trade_price),
  volume24h: toNumber(row.volume_24h),
  volumeTotal: toNumber(row.volume_total),
  lastSyncedAt: toNullableIsoString(row.last_synced_at),
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  outcomes: [],
  recentTrades: [],
  latestOrderbook: [],
});

const mapOutcome = (row: ExternalOutcomeRow): ExternalOutcomeView => ({
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

const mapOrderbookSnapshot = (row: ExternalOrderbookSnapshotRow): ExternalOrderbookSnapshotView => ({
  externalOutcomeId: row.external_outcome_id,
  bids: row.bids_json,
  asks: row.asks_json,
  capturedAt: toIsoString(row.captured_at),
  lastTradePrice: toNumber(row.last_trade_price),
  bestBid: toNumber(row.best_bid),
  bestAsk: toNumber(row.best_ask),
});

const mapTrade = (row: ExternalTradeRow): ExternalTradeView => ({
  externalTradeId: row.external_trade_id,
  externalOutcomeId: row.external_outcome_id,
  side: row.side,
  price: ppmToPrice(row.price_ppm),
  size: atomsToSize(row.size_atoms),
  tradedAt: toIsoString(row.executed_at),
});

const mapImportedTrade = (row: ExternalTradeRow): ExternalImportedTradeView => ({
  externalTradeId: row.external_trade_id,
  externalOutcomeId: row.external_outcome_id,
  source: row.source,
  side: row.side,
  price: ppmToPrice(row.price_ppm),
  pricePpm: toBigIntString(row.price_ppm),
  size: atomsToSize(row.size_atoms),
  sizeAtoms: toBigIntString(row.size_atoms),
  executedAt: toIsoString(row.executed_at),
});

export const createExternalMarketsRepository = (database: DatabaseExecutor) => {
  const attachChildren = async (marketRecords: ExternalMarketView[]): Promise<ExternalMarketView[]> => {
    if (marketRecords.length === 0) {
      return marketRecords;
    }

    const ids = marketRecords.map((market) => market.id);

    const [outcomeRows, tradeRows, snapshotRows] = await Promise.all([
      database.query<ExternalOutcomeRow>(
        `
          select
            external_market_id,
            external_outcome_id,
            title,
            slug,
            outcome_index,
            yes_no,
            best_bid,
            best_ask,
            last_price,
            volume
          from public.external_outcomes
          where external_market_id = any($1::uuid[])
          order by external_market_id asc, outcome_index asc
        `,
        [ids],
      ),
      database.query<ExternalTradeRow>(
        `
          select
            external_market_id,
            external_trade_id,
            external_outcome_id,
            source,
            side,
            price_ppm,
            size_atoms,
            executed_at
          from public.external_trade_ticks
          where external_market_id = any($1::uuid[])
          order by external_market_id asc, executed_at desc, external_trade_id desc
        `,
        [ids],
      ),
      database.query<ExternalOrderbookSnapshotRow>(
        `
          select distinct on (external_market_id, external_outcome_id)
            external_market_id,
            external_outcome_id,
            bids_json,
            asks_json,
            captured_at,
            last_trade_price,
            best_bid,
            best_ask
          from public.external_orderbook_snapshots
          where external_market_id = any($1::uuid[])
          order by external_market_id asc, external_outcome_id asc, captured_at desc
        `,
        [ids],
      ),
    ]);

    const byMarket = new Map(marketRecords.map((market) => [market.id, market]));
    const outcomeByMarketAndExternalId = new Map<string, ExternalOutcomeView>();

    for (const row of outcomeRows) {
      const market = byMarket.get(row.external_market_id);
      if (!market) {
        continue;
      }

      const outcome = mapOutcome(row);
      market.outcomes.push(outcome);
      outcomeByMarketAndExternalId.set(`${row.external_market_id}:${row.external_outcome_id}`, outcome);
    }

    for (const row of snapshotRows) {
      byMarket.get(row.external_market_id)?.latestOrderbook.push(mapOrderbookSnapshot(row));
    }

    const tradeCountByMarket = new Map<string, number>();
    const latestTradeByMarket = new Set<string>();
    const latestTradeByOutcome = new Set<string>();
    for (const row of tradeRows) {
      const market = byMarket.get(row.external_market_id);
      if (market && !latestTradeByMarket.has(row.external_market_id)) {
        market.lastTradePrice = ppmToPrice(row.price_ppm);
        latestTradeByMarket.add(row.external_market_id);
      }

      if (row.external_outcome_id) {
        const outcomeKey = `${row.external_market_id}:${row.external_outcome_id}`;
        if (!latestTradeByOutcome.has(outcomeKey)) {
          const outcome = outcomeByMarketAndExternalId.get(outcomeKey);
          if (outcome) {
            outcome.lastPrice = ppmToPrice(row.price_ppm);
          }
          latestTradeByOutcome.add(outcomeKey);
        }
      }

      const current = tradeCountByMarket.get(row.external_market_id) ?? 0;
      if (current < 20) {
        market?.recentTrades.push(mapTrade(row));
        tradeCountByMarket.set(row.external_market_id, current + 1);
      }
    }

    return marketRecords;
  };

  const listExternalMarketRecords = async (): Promise<ExternalMarketView[]> => {
    const rows = await database.query<ExternalMarketRow>(
      `
        select
          id,
          source,
          external_id,
          slug,
          title,
          description,
          status,
          market_url,
          close_time,
          end_time,
          resolved_at,
          best_bid,
          best_ask,
          last_trade_price,
          volume_24h,
          volume_total,
          last_synced_at,
          created_at,
          updated_at
        from public.external_markets
        order by last_synced_at desc nulls last, updated_at desc, id asc
        limit 500
      `,
    );

    return attachChildren(rows.map(mapMarket));
  };

  const getExternalMarketRecord = async (source: string, externalId: string): Promise<ExternalMarketView | null> => {
    const [row] = await database.query<ExternalMarketRow>(
      `
        select
          id,
          source,
          external_id,
          slug,
          title,
          description,
          status,
          market_url,
          close_time,
          end_time,
          resolved_at,
          best_bid,
          best_ask,
          last_trade_price,
          volume_24h,
          volume_total,
          last_synced_at,
          created_at,
          updated_at
        from public.external_markets
        where source = $1 and external_id = $2
        limit 1
      `,
      [source, externalId],
    );

    if (!row) {
      return null;
    }

    const [market] = await attachChildren([mapMarket(row)]);
    return market;
  };

  const listExternalMarketTrades = async (
    source: string,
    externalId: string,
    limit = 200,
  ): Promise<ExternalImportedTradeView[] | null> => {
    const [market] = await database.query<{ id: string }>(
      `
        select id
        from public.external_markets
        where source = $1 and external_id = $2
        limit 1
      `,
      [source, externalId],
    );

    if (!market) {
      return null;
    }

    const rows = await database.query<ExternalTradeRow>(
      `
        select
          external_market_id,
          external_trade_id,
          external_outcome_id,
          source,
          side,
          price_ppm,
          size_atoms,
          executed_at
        from public.external_trade_ticks
        where external_market_id = $1::uuid
        order by executed_at desc, external_trade_id desc
        limit $2
      `,
      [market.id, limit],
    );

    return rows.map(mapImportedTrade);
  };

  return {
    listExternalMarketRecords,
    getExternalMarketRecord,
    listExternalMarketTrades,
  };
};

const repository = createExternalMarketsRepository(defaultDb);
let repositoryOverride: ReturnType<typeof createExternalMarketsRepository> | null = null;

export const setExternalMarketsRepositoryForTests = (
  override: ReturnType<typeof createExternalMarketsRepository> | null,
): void => {
  repositoryOverride = override;
};

export const listExternalMarketRecords = async (): Promise<ExternalMarketView[]> =>
  (repositoryOverride ?? repository).listExternalMarketRecords();

export const getExternalMarketRecord = async (source: string, externalId: string): Promise<ExternalMarketView | null> =>
  (repositoryOverride ?? repository).getExternalMarketRecord(source, externalId);

export const listExternalMarketTrades = async (
  source: string,
  externalId: string,
): Promise<ExternalImportedTradeView[] | null> =>
  (repositoryOverride ?? repository).listExternalMarketTrades(source, externalId);
