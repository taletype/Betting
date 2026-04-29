import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";

import { readExternalMarketBySourceAndId } from "../../../../../api/_shared/external-market-read";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; externalId: string }> },
) {
  const { source, externalId } = await params;

  try {
    const market = await readExternalMarketBySourceAndId(createSupabaseAdminClient(), source, externalId);
    return NextResponse.json({ orderbook: market?.latestOrderbook ?? [], depth: [] });
  } catch (error) {
    console.warn("external market orderbook unavailable; serving safe empty state", error);
    return NextResponse.json({ orderbook: [], depth: [] });
  }
}
