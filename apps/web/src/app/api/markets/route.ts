import { NextResponse } from "next/server";
import { createDatabaseClient } from "@bet/db";

export async function GET() {
  try {
    const db = createDatabaseClient();
    
    const marketRows = await db.query(`
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
    `);

    const outcomeRows = await db.query(`
      select id, market_id, slug, title, outcome_index, created_at
      from public.outcomes
      where market_id = any($1::uuid[])
      order by market_id asc, outcome_index asc
    `, [marketRows.map((m: any) => m.id)]);

    const statsRows = await db.query(`
      with last_trades as (
        select distinct on (market_id)
          market_id,
          price as last_trade_price
        from public.trades
        where market_id = any($1::uuid[])
        order by market_id asc, matched_at desc, sequence desc
      ),
      trade_volumes as (
        select
          market_id,
          coalesce(sum(notional), 0::bigint) as volume_notional
        from public.trades
        where market_id = any($1::uuid[])
        group by market_id
      )
      select
        coalesce(last_trades.market_id, trade_volumes.market_id) as market_id,
        last_trades.last_trade_price,
        coalesce(trade_volumes.volume_notional, 0::bigint) as volume_notional
      from last_trades
      full outer join trade_volumes on trade_volumes.market_id = last_trades.market_id
    `, [marketRows.map((m: any) => m.id)]);

    const outcomesByMarketId = new Map<string, any[]>();
    for (const row of outcomeRows) {
      const outcomes = outcomesByMarketId.get(row.market_id) ?? [];
      outcomes.push({
        id: row.id,
        marketId: row.market_id,
        slug: row.slug,
        title: row.title,
        index: row.outcome_index,
        createdAt: row.created_at,
      });
      outcomesByMarketId.set(row.market_id, outcomes);
    }

    const statsByMarketId = new Map<string, any>();
    for (const row of statsRows) {
      statsByMarketId.set(row.market_id, {
        bestBid: null,
        bestAsk: null,
        lastTradePrice: row.last_trade_price,
        volumeNotional: row.volume_notional,
      });
    }

    const markets = marketRows.map((row: any) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      status: row.status,
      collateralCurrency: row.collateral_currency,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      tickSize: row.tick_size,
      createdAt: row.created_at,
      closesAt: row.close_time,
      resolvesAt: row.resolve_time,
      outcomes: outcomesByMarketId.get(row.id) ?? [],
      stats: statsByMarketId.get(row.id) ?? {
        bestBid: null,
        bestAsk: null,
        lastTradePrice: null,
        volumeNotional: 0n,
      },
    }));

    return NextResponse.json(markets);
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
