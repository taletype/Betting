import { fetchPolymarketGammaEventMarkets } from "@bet/integrations";

import {
  createMarketSyncRun,
  finishMarketSyncRun,
  upsertExternalMarketsCache,
} from "./external-market-cache";

type SupabaseLike = {
  from: (table: string) => unknown;
};

export interface PolymarketCacheSyncResult {
  ok: boolean;
  status: "success" | "partial" | "failure" | "skipped";
  marketsSeen: number;
  marketsUpserted: number;
  runId: string | null;
  error?: string;
}

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Polymarket cache sync failed";

export async function syncPolymarketMarketCache(
  supabase: SupabaseLike,
  options: { limit?: number; syncKind?: string; staleMs?: number } = {},
): Promise<PolymarketCacheSyncResult> {
  const syncKind = options.syncKind ?? "market_list";
  const runId = await createMarketSyncRun(supabase, syncKind);
  if (!runId) {
    return { ok: true, status: "skipped", marketsSeen: 0, marketsUpserted: 0, runId: null };
  }

  try {
    const records = await fetchPolymarketGammaEventMarkets({ limit: options.limit ?? 100 });
    const staleAfter = new Date(Date.now() + (options.staleMs ?? 60_000)).toISOString();
    const marketsUpserted = await upsertExternalMarketsCache(
      supabase,
      records.map((record) => ({
        market: record.market,
        rawJson: record.rawJson,
        sourceProvenance: {
          ...record.provenance,
          cacheWriter: "web-sync-polymarket",
          fetchedVia: "public-gamma",
        },
        staleAfter,
      })),
    );

    await finishMarketSyncRun(supabase, runId, {
      status: "success",
      marketsSeen: records.length,
      marketsUpserted,
      diagnostics: {
        upstream: "gamma-api.polymarket.com",
        clobReadEnabled: false,
        privateTradingEndpointsUsed: false,
      },
    });

    return { ok: true, status: "success", marketsSeen: records.length, marketsUpserted, runId };
  } catch (error) {
    await finishMarketSyncRun(supabase, runId, {
      status: "failure",
      errorMessage: safeErrorMessage(error),
      diagnostics: {
        upstream: "gamma-api.polymarket.com",
        privateTradingEndpointsUsed: false,
      },
    }).catch(() => undefined);
    return { ok: false, status: "failure", marketsSeen: 0, marketsUpserted: 0, runId, error: safeErrorMessage(error) };
  }
}
