import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import { readExternalMarketBySourceAndId } from "../../../../../api/_shared/external-market-read";

export const dynamic = "force-dynamic";

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const buildDepth = (orderbook: Array<{ bids: unknown; asks: unknown }>) => {
  const depth: Array<{ side: "bid" | "ask"; price: number | null; size: number | null; cumulativeSize: number | null }> = [];

  for (const snapshot of orderbook) {
    for (const [side, levels] of [["bid", snapshot.bids], ["ask", snapshot.asks]] as const) {
      if (!Array.isArray(levels)) {
        continue;
      }

      let cumulativeSize = 0;
      for (const level of levels.slice(0, 20)) {
        const record = level && typeof level === "object" ? level as Record<string, unknown> : {};
        const price = toNumber(record.price);
        const size = toNumber(record.size);
        if (size !== null) {
          cumulativeSize += size;
        }
        depth.push({ side, price, size, cumulativeSize: size === null ? null : cumulativeSize });
      }
    }
  }

  return depth;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; externalId: string }> },
) {
  const { source, externalId } = await params;

  try {
    const market = await readExternalMarketBySourceAndId(createSupabaseAdminClient(), source, externalId);
    const orderbook = market?.latestOrderbook ?? [];
    return NextResponse.json({ orderbook, depth: buildDepth(orderbook) });
  } catch (error) {
    console.warn("external market orderbook unavailable; serving safe empty state", error);
    return NextResponse.json({ orderbook: [], depth: [] });
  }
}
