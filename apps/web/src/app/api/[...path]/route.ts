import { NextRequest, NextResponse } from "next/server";
import { createDatabaseClient } from "@bet/db";

async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const apiPath = path.join("/");
  const url = new URL(request.url);

  try {
    const db = createDatabaseClient();

    // Handle specific endpoints directly from database
    if (apiPath === "markets" && request.method === "GET") {
      const marketRows = await db.query(`
        select id, slug, title, description, status, collateral_currency, min_price, max_price, tick_size, close_time, resolve_time, created_at
        from public.markets
        order by created_at desc, id asc
      `);
      const outcomeRows = await db.query(`
        select id, market_id, slug, title, outcome_index, created_at
        from public.outcomes
        where market_id = any($1::uuid[])
        order by market_id asc, outcome_index asc
      `, [marketRows.map((m: any) => m.id)]);

      const outcomesByMarketId = new Map<string, any[]>();
      for (const row of outcomeRows) {
        const outcomes = outcomesByMarketId.get(row.market_id) ?? [];
        outcomes.push({
          id: row.id, marketId: row.market_id, slug: row.slug, title: row.title,
          index: row.outcome_index, createdAt: row.created_at,
        });
        outcomesByMarketId.set(row.market_id, outcomes);
      }

      const markets = marketRows.map((row: any) => ({
        id: row.id, slug: row.slug, title: row.title, description: row.description,
        status: row.status, collateralCurrency: row.collateral_currency,
        minPrice: row.min_price, maxPrice: row.max_price, tickSize: row.tick_size,
        createdAt: row.created_at, closesAt: row.close_time, resolvesAt: row.resolve_time,
        outcomes: outcomesByMarketId.get(row.id) ?? [],
        stats: { bestBid: null, bestAsk: null, lastTradePrice: null, volumeNotional: 0n },
      }));

      return NextResponse.json(markets);
    }

    // Handle market detail endpoint
    if (apiPath.match(/^markets\/[^\/]+$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1];
      const [marketRow] = await db.query(`
        select id, slug, title, description, status, collateral_currency, min_price, max_price, tick_size, close_time, resolve_time, created_at
        from public.markets
        where id = $1::uuid
        limit 1
      `, [marketId]);

      if (!marketRow) {
        return NextResponse.json({ market: null }, { status: 404 });
      }

      const outcomeRows = await db.query(`
        select id, market_id, slug, title, outcome_index, created_at
        from public.outcomes
        where market_id = $1::uuid
        order by outcome_index asc
      `, [marketId]);

      const market = {
        id: marketRow.id, slug: marketRow.slug, title: marketRow.title, description: marketRow.description,
        status: marketRow.status, collateralCurrency: marketRow.collateral_currency,
        minPrice: marketRow.min_price, maxPrice: marketRow.max_price, tickSize: marketRow.tick_size,
        createdAt: marketRow.created_at, closesAt: marketRow.close_time, resolvesAt: marketRow.resolve_time,
        outcomes: outcomeRows.map((r: any) => ({
          id: r.id, marketId: r.market_id, slug: r.slug, title: r.title,
          index: r.outcome_index, createdAt: r.created_at,
        })),
        stats: { bestBid: null, bestAsk: null, lastTradePrice: null, volumeNotional: 0n },
      };

      return NextResponse.json({ market });
    }

    // Handle health check
    if (apiPath === "health" && request.method === "GET") {
      return NextResponse.json({ ok: true, service: "api", checkedAt: new Date().toISOString() });
    }

    // Return 404 for unhandled endpoints
    return NextResponse.json({ error: "Endpoint not implemented" }, { status: 404 });
  } catch (error) {
    console.error(`Error handling /${apiPath}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const PATCH = handleRequest;
