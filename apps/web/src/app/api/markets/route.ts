import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
    );

    const { data: marketRows, error: marketError } = await supabase
      .from("markets")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (marketError) throw marketError;

    if (!marketRows || marketRows.length === 0) {
      return NextResponse.json([]);
    }

    const marketIds = marketRows.map((m: any) => m.id);

    const { data: outcomeRows } = await supabase
      .from("outcomes")
      .select("*")
      .in("market_id", marketIds)
      .order("market_id", { ascending: true })
      .order("outcome_index", { ascending: true });

    const outcomesByMarketId = new Map<string, any[]>();
    if (outcomeRows) {
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
      stats: {
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
