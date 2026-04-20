import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

const toIso = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
};

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: marketRows, error: marketError } = await supabase
      .from("markets")
      .select("id, slug, title, description, status, collateral_currency, min_price, max_price, tick_size, close_time, resolve_time, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (marketError) {
      throw marketError;
    }

    if (!marketRows || marketRows.length === 0) {
      return NextResponse.json([]);
    }

    const { data: outcomeRows, error: outcomeError } = await supabase
      .from("outcomes")
      .select("id, market_id, slug, title, outcome_index, created_at")
      .in("market_id", marketRows.map((market) => market.id))
      .order("market_id", { ascending: true })
      .order("outcome_index", { ascending: true });

    if (outcomeError) {
      throw outcomeError;
    }

    const outcomesByMarketId = new Map<string, Array<Record<string, unknown>>>();
    for (const row of outcomeRows ?? []) {
      const outcomes = outcomesByMarketId.get(row.market_id) ?? [];
      outcomes.push({
        id: row.id,
        marketId: row.market_id,
        slug: row.slug,
        title: row.title,
        index: row.outcome_index,
        createdAt: toIso(row.created_at),
      });
      outcomesByMarketId.set(row.market_id, outcomes);
    }

    return NextResponse.json(
      marketRows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        status: row.status,
        collateralCurrency: row.collateral_currency,
        minPrice: String(row.min_price),
        maxPrice: String(row.max_price),
        tickSize: String(row.tick_size),
        createdAt: toIso(row.created_at),
        closesAt: toIso(row.close_time),
        resolvesAt: toIso(row.resolve_time),
        outcomes: outcomesByMarketId.get(row.id) ?? [],
        stats: {
          bestBid: null,
          bestAsk: null,
          lastTradePrice: null,
          volumeNotional: "0",
        },
      })),
    );
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
