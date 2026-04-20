import type { Market, Outcome } from "@bet/contracts";
import { createDatabaseClient } from "@bet/db";

interface MarketRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: Market["status"];
  collateral_currency: string;
  min_price: bigint;
  max_price: bigint;
  tick_size: bigint;
  close_time: Date | string | null;
  resolve_time: Date | string | null;
  created_at: Date | string;
}

interface OutcomeRow {
  id: string;
  market_id: string;
  slug: string;
  title: string;
  outcome_index: number;
  created_at: Date | string;
}

const db = createDatabaseClient();

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIsoString = (value: Date | string | null): string | null =>
  value ? toIsoString(value) : null;

const mapOutcome = (row: OutcomeRow): Outcome => ({
  id: row.id,
  marketId: row.market_id,
  slug: row.slug,
  title: row.title,
  index: row.outcome_index,
  createdAt: toIsoString(row.created_at),
});

const mapMarket = (row: MarketRow, outcomes: Outcome[]): Market => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: row.status,
  collateralCurrency: row.collateral_currency,
  minPrice: row.min_price,
  maxPrice: row.max_price,
  tickSize: row.tick_size,
  createdAt: toIsoString(row.created_at),
  closesAt: toNullableIsoString(row.close_time),
  resolvesAt: toNullableIsoString(row.resolve_time),
  outcomes,
});

const listOutcomeRows = async (marketIds: readonly string[]): Promise<OutcomeRow[]> => {
  if (marketIds.length === 0) {
    return [];
  }

  return db.query<OutcomeRow>(
    `
      select id, market_id, slug, title, outcome_index, created_at
      from public.outcomes
      where market_id = any($1::uuid[])
      order by market_id asc, outcome_index asc
    `,
    [marketIds],
  );
};

export const listMarketRecords = async (): Promise<Market[]> => {
  const marketRows = await db.query<MarketRow>(
    `
      select
        id,
        slug,
        title,
        description,
        status,
        collateral_currency,
        min_price,
        max_price,
        tick_size,
        close_time,
        resolve_time,
        created_at
      from public.markets
      order by created_at desc, id asc
    `,
  );

  const outcomeRows = await listOutcomeRows(marketRows.map((market) => market.id));
  const outcomesByMarketId = new Map<string, Outcome[]>();

  for (const row of outcomeRows) {
    const outcomes = outcomesByMarketId.get(row.market_id) ?? [];
    outcomes.push(mapOutcome(row));
    outcomesByMarketId.set(row.market_id, outcomes);
  }

  return marketRows.map((row) => mapMarket(row, outcomesByMarketId.get(row.id) ?? []));
};

export const getMarketRecordById = async (marketId: string): Promise<Market | null> => {
  const [marketRow] = await db.query<MarketRow>(
    `
      select
        id,
        slug,
        title,
        description,
        status,
        collateral_currency,
        min_price,
        max_price,
        tick_size,
        close_time,
        resolve_time,
        created_at
      from public.markets
      where id = $1::uuid
      limit 1
    `,
    [marketId],
  );

  if (!marketRow) {
    return null;
  }

  const outcomeRows = await listOutcomeRows([marketId]);
  return mapMarket(
    marketRow,
    outcomeRows.map((row) => mapOutcome(row)),
  );
};
