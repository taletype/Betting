import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase/admin";

import { evaluateAdminAccess, getAuthenticatedUser } from "../auth";
import { getSafeLaunchStatus } from "./launch-status";
import { getMarketTranslationConfig } from "./market-translation";

type SupabaseAdminFactory = typeof createSupabaseAdminClient;

type SupabaseLike = {
  from: (table: string) => unknown;
};

interface ExternalMarketCacheStatusRow {
  is_active: boolean | null;
  stale_after: string | null;
}

interface ExternalMarketSyncRunRow {
  sync_kind?: string | null;
  status?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  markets_seen?: number | string | null;
  markets_upserted?: number | string | null;
  error_message?: string | null;
  diagnostics?: unknown;
}

interface TranslationStatusRow {
  locale: string;
  status: string;
  translated_at: string | null;
  updated_at: string | null;
}

interface BuilderFeeRunRow {
  id: string;
  source: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  imported_count: number | string | null;
  matched_count: number | string | null;
  confirmed_count: number | string | null;
  disputed_count: number | string | null;
  voided_count: number | string | null;
  error_message: string | null;
  metadata_json: unknown;
}

interface BuilderFeeImportRow {
  id: string;
  status: string;
  external_order_id: string | null;
  external_trade_id: string | null;
  token_id: string | null;
  imported_at: string | null;
}

const getAdminSupabase = () => createSupabaseAdminClient();

const toNumber = (value: number | string | null | undefined): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoOrNull = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const readCacheRows = async (supabase: SupabaseLike): Promise<ExternalMarketCacheStatusRow[]> => {
  const { data, error } = await (supabase.from("external_market_cache") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: Record<string, unknown>) => {
          order: (column: string, options?: Record<string, unknown>) => {
            limit: (count: number) => Promise<{ data: ExternalMarketCacheStatusRow[] | null; error: Error | null }>;
          };
        };
      };
    };
  })
    .select("is_active, stale_after")
    .eq("source", "polymarket")
    .order("stale_after", { ascending: true, nullsFirst: true })
    .order("is_active", { ascending: false })
    .limit(1000);

  if (error) throw error;
  return data ?? [];
};

const readRecentRuns = async (supabase: SupabaseLike): Promise<ExternalMarketSyncRunRow[]> => {
  const { data, error } = await (supabase.from("external_market_sync_runs") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: Record<string, unknown>) => {
          limit: (count: number) => Promise<{ data: ExternalMarketSyncRunRow[] | null; error: Error | null }>;
        };
      };
    };
  })
    .select("sync_kind, status, started_at, finished_at, markets_seen, markets_upserted, error_message, diagnostics")
    .eq("source", "polymarket")
    .order("started_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data ?? [];
};

const readTranslationRows = async (supabase: SupabaseLike): Promise<TranslationStatusRow[]> => {
  try {
    const { data, error } = await (supabase.from("external_market_translations") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{ data: TranslationStatusRow[] | null; error: Error | null }>;
      };
    })
      .select("locale, status, translated_at, updated_at")
      .eq("source", "polymarket");
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
};

const readBuilderFeeRuns = async (supabase: SupabaseLike): Promise<BuilderFeeRunRow[]> => {
  try {
    const { data, error } = await (supabase.from("polymarket_builder_fee_reconciliation_runs") as {
      select: (columns: string) => {
        order: (column: string, options?: Record<string, unknown>) => {
          limit: (count: number) => Promise<{ data: BuilderFeeRunRow[] | null; error: Error | null }>;
        };
      };
    })
      .select("id, source, status, started_at, finished_at, imported_count, matched_count, confirmed_count, disputed_count, voided_count, error_message, metadata_json")
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
};

const readBuilderFeeImports = async (supabase: SupabaseLike): Promise<BuilderFeeImportRow[]> => {
  try {
    const { data, error } = await (supabase.from("polymarket_builder_fee_imports") as {
      select: (columns: string) => {
        order: (column: string, options?: Record<string, unknown>) => {
          limit: (count: number) => Promise<{ data: BuilderFeeImportRow[] | null; error: Error | null }>;
        };
      };
    })
      .select("id, status, external_order_id, external_trade_id, token_id, imported_at")
      .order("imported_at", { ascending: false })
      .limit(250);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
};

export const getAdminPolymarketStatusPayload = async (
  adminSupabase: SupabaseAdminFactory = getAdminSupabase,
) => {
  const supabase = adminSupabase() as unknown as SupabaseLike;
  const now = Date.now();
  const [cacheRows, recentRuns, translationRows, builderFeeRuns, builderFeeImports] = await Promise.all([
    readCacheRows(supabase),
    readRecentRuns(supabase),
    readTranslationRows(supabase),
    readBuilderFeeRuns(supabase),
    readBuilderFeeImports(supabase),
  ]);
  const preflight = getSafeLaunchStatus();
  const translationConfig = getMarketTranslationConfig();
  const byLocale = Object.fromEntries(translationConfig.locales.map((locale) => {
    const rows = translationRows.filter((row) => row.locale === locale);
    return [locale, {
      translated: rows.filter((row) => row.status === "translated" || row.status === "reviewed").length,
      failed: rows.filter((row) => row.status === "failed").length,
      stale: rows.filter((row) => row.status === "stale").length,
      pending: rows.filter((row) => row.status === "pending" || row.status === "skipped").length,
    }];
  }));
  const lastTranslationSync = translationRows
    .map((row) => row.translated_at ?? row.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    source: "polymarket",
    marketCounts: {
      total: cacheRows.length,
      open: cacheRows.filter((row) => row.is_active === true).length,
      stale: cacheRows.filter((row) => !row.stale_after || new Date(row.stale_after).getTime() <= now).length,
      errored: recentRuns.filter((run) => run.status === "failure").length,
    },
    preflight,
    syncCadence: {
      metadata: "5-15 minutes",
      hotMarketPrices: "15-60 seconds",
      orderbookSnapshots: "30-120 seconds for hot/detail markets",
      recentTrades: "1-5 minutes",
      staleness: "1-5 minutes",
    },
    translation: {
      defaultLocale: translationConfig.defaultLocale,
      supportedLocales: translationConfig.locales,
      enabled: translationConfig.enabled,
      provider: translationConfig.provider,
      model: translationConfig.model,
      coverageByLocale: byLocale,
      lastTranslationSync: toIsoOrNull(lastTranslationSync),
    },
    recentRuns: recentRuns.map((run) => ({
      syncKind: run.sync_kind ?? "unknown",
      status: run.status ?? "unknown",
      startedAt: toIsoOrNull(run.started_at),
      finishedAt: toIsoOrNull(run.finished_at),
      marketsSeen: toNumber(run.markets_seen),
      marketsUpserted: toNumber(run.markets_upserted),
      errorMessage: run.error_message ?? null,
      diagnostics: run.diagnostics ?? null,
    })),
    builderFeeReconciliation: {
      builderCodeConfigured: preflight.builderCodeConfigured,
      evidenceSourceConfigured: Boolean(process.env.POLYMARKET_BUILDER_FEE_EVIDENCE_URL?.trim()),
      latestRunStatus: builderFeeRuns[0]?.status ?? null,
      lastError: builderFeeRuns[0]?.error_message ?? null,
      counts: {
        imported: builderFeeImports.length,
        matched: builderFeeImports.filter((row) => row.status === "matched").length,
        confirmed: builderFeeImports.filter((row) => row.status === "confirmed").length,
        disputed: builderFeeImports.filter((row) => row.status === "disputed").length,
        voided: builderFeeImports.filter((row) => row.status === "void").length,
      },
      unmatchedFeeEvidence: builderFeeImports
        .filter((row) => row.status === "imported")
        .slice(0, 25)
        .map((row) => ({
          id: row.id,
          externalOrderId: row.external_order_id,
          externalTradeId: row.external_trade_id,
          tokenId: row.token_id,
          importedAt: toIsoOrNull(row.imported_at),
        })),
      recentRuns: builderFeeRuns.map((run) => ({
        id: run.id,
        source: run.source,
        status: run.status,
        startedAt: toIsoOrNull(run.started_at),
        finishedAt: toIsoOrNull(run.finished_at),
        importedCount: toNumber(run.imported_count),
        matchedCount: toNumber(run.matched_count),
        confirmedCount: toNumber(run.confirmed_count),
        disputedCount: toNumber(run.disputed_count),
        voidedCount: toNumber(run.voided_count),
        errorMessage: run.error_message,
        metadata: run.metadata_json ?? null,
      })),
    },
  };
};

export async function adminPolymarketStatusResponse(
  request: NextRequest,
  adminSupabase: SupabaseAdminFactory = getAdminSupabase,
) {
  const user = await getAuthenticatedUser(request);
  const admin = evaluateAdminAccess(user);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  return NextResponse.json(await getAdminPolymarketStatusPayload(adminSupabase));
}
