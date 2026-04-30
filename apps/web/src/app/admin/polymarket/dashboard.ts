import { createSupabaseAdminClient } from "@bet/supabase/admin";

import { readPolymarketGammaFallbackMarkets } from "../../api/_shared/polymarket-gamma-fallback";
import { getSafeLaunchStatus } from "../../api/_shared/launch-status";
import type { getAdminAmbassadorOverview } from "../../../lib/api";

export type PreflightStatus = "blocked" | "ready_for_staging" | "ready_for_live";

export interface RedactedDashboardError {
  code: string;
  source: string;
}

export interface PolymarketOperationsDashboard {
  marketDataHealth: {
    backendReachable: boolean;
    backendMarketCount: number | null;
    gammaFallbackReachable: boolean;
    gammaFallbackMarketCount: number | null;
    lastCheckedAt: string;
    lastError: RedactedDashboardError | null;
  };
  publicPages: {
    polymarketStatus: number | "unreachable";
    externalMarketsStatus: number | "unreachable";
    latestMarketCount: number | null;
    supabaseCacheReachable: boolean | null;
    newestLastSyncedAt: string | null;
    staleMarketCount: number | null;
    lastSyncStatus: string | null;
    fallbackUsedLastRequest: boolean | null;
    diagnosis: "ok" | "safe_empty" | "unavailable";
  };
  readiness: {
    builderCodeConfigured: boolean;
    publicRoutedTradingEnabled: boolean;
    betaRoutedTradingEnabled: boolean;
    routedTradingEnabled: boolean;
    currentUserAllowlisted: boolean | null;
    canaryOnly: boolean;
    allowedUsersCount: number;
    killSwitchActive: boolean;
    clobSubmitterMode: "disabled" | "real";
    submitterReady: boolean;
    attributionRecordingReady: boolean;
    signatureVerifierImplemented: boolean;
    l2CredentialLookupImplemented: boolean;
    serverGeoblockVerifierImplemented: boolean;
    l2CredentialReadyCount: number | null;
    regionCheckStatus: "implemented" | "missing";
    lastPreflightFailures: string[];
    lastSubmitAttempts: number | null;
    lastBuilderAttributionSync: string | null;
    preflightStatus: PreflightStatus;
  };
  rewards: {
    ambassadorCodesCount: number | null;
    directReferralAttributionCount: number | null;
    pendingRewards: number | null;
    payableRewards: number | null;
    payoutRequests: number | null;
    openHighRiskFlags: number | null;
    autoPayoutEnabled: boolean;
  };
}

type AmbassadorOverview = Awaited<ReturnType<typeof getAdminAmbassadorOverview>>;

interface DashboardDependencies {
  now?: Date;
  countBackendMarkets?: () => Promise<number>;
  readGammaFallbackMarkets?: () => Promise<unknown[]>;
  fetchPublicPath?: (path: string) => Promise<{ status: number; json: unknown }>;
  readAmbassadorOverview?: () => Promise<AmbassadorOverview | null>;
  currentUser?: { id: string; email: string | null } | null;
}

interface SupabaseExternalMarketCounter {
  from: (table: "external_market_cache") => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => {
      eq: (
        column: "source",
        value: "polymarket",
      ) => Promise<{ count: number | null; error: { code?: string; message?: string } | null }>;
    };
  };
}

const readBoolean = (name: string, defaultValue = false): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value);
};

const readEnvList = (name: string): string[] =>
  (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const isAllowlisted = (user: { id: string; email: string | null } | null | undefined): boolean | null => {
  if (!user) return null;
  const allowlist = new Set([
    ...readEnvList("POLYMARKET_ROUTED_TRADING_ALLOWLIST"),
    ...readEnvList("POLYMARKET_ROUTED_TRADING_CANARY_USER_IDS"),
    ...readEnvList("POLYMARKET_ROUTED_TRADING_CANARY_EMAILS"),
  ]);
  return allowlist.has(user.id.toLowerCase()) || (user.email ? allowlist.has(user.email.toLowerCase()) : false);
};

const getLocalWebBaseUrl = (): string => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (siteUrl?.trim()) {
    return siteUrl.startsWith("http") ? siteUrl.replace(/\/+$/, "") : `https://${siteUrl.replace(/\/+$/, "")}`;
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl?.trim()) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }

  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
};

const defaultFetchPublicPath = async (path: string): Promise<{ status: number; json: unknown }> => {
  const response = await fetch(`${getLocalWebBaseUrl()}${path}`, { cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  const json = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  return { status: response.status, json };
};

const countBackendPolymarketRows = async (): Promise<number> => {
  const supabase = createSupabaseAdminClient() as unknown as SupabaseExternalMarketCounter;
  const { count, error } = await supabase
    .from("external_market_cache")
    .select("id", { count: "exact", head: true })
    .eq("source", "polymarket");

  if (error) {
    const failure = new Error(error.code ?? "external_markets_count_failed");
    failure.name = "EXTERNAL_MARKETS_COUNT_FAILED";
    throw failure;
  }

  return count ?? 0;
};

const errorCode = (error: unknown): string => {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }

  if (error instanceof Error && error.name && error.name !== "Error") {
    return error.name.slice(0, 80);
  }

  return "ERROR";
};

const redactedError = (error: unknown, source: string): RedactedDashboardError => ({
  code: errorCode(error).replace(/[^A-Z0-9_:-]/gi, "_"),
  source,
});

const getPublicPages = async (
  fetchPublicPath: NonNullable<DashboardDependencies["fetchPublicPath"]>,
): Promise<PolymarketOperationsDashboard["publicPages"]> => {
  const [polymarket, externalMarkets] = await Promise.allSettled([
    fetchPublicPath("/polymarket"),
    fetchPublicPath("/api/external/markets"),
  ]);

  const polymarketStatus = polymarket.status === "fulfilled" ? polymarket.value.status : "unreachable";
  const externalMarketsStatus = externalMarkets.status === "fulfilled" ? externalMarkets.value.status : "unreachable";
  const payload = externalMarkets.status === "fulfilled" ? externalMarkets.value.json : null;
  const envelope = payload && typeof payload === "object" ? payload as {
    fallbackUsed?: boolean;
    diagnostics?: {
      supabaseCacheReachable?: boolean;
      newestLastSyncedAt?: string | null;
      staleMarketCount?: number | null;
      lastSyncStatus?: string | null;
      fallbackUsedLastRequest?: boolean;
    };
  } : null;
  const latestMarketCount = Array.isArray(payload)
    ? payload.length
    : payload && typeof payload === "object" && Array.isArray((payload as { markets?: unknown[] }).markets)
      ? ((payload as { markets: unknown[] }).markets.length)
      : null;
  const diagnosis = externalMarketsStatus === 200
    ? latestMarketCount === 0
      ? "safe_empty"
      : "ok"
    : "unavailable";

  return {
    polymarketStatus,
    externalMarketsStatus,
    latestMarketCount,
    supabaseCacheReachable: envelope?.diagnostics?.supabaseCacheReachable ?? null,
    newestLastSyncedAt: envelope?.diagnostics?.newestLastSyncedAt ?? null,
    staleMarketCount: envelope?.diagnostics?.staleMarketCount ?? null,
    lastSyncStatus: envelope?.diagnostics?.lastSyncStatus ?? null,
    fallbackUsedLastRequest: envelope?.diagnostics?.fallbackUsedLastRequest ?? envelope?.fallbackUsed ?? null,
    diagnosis,
  };
};

const getReadiness = (
  overview: AmbassadorOverview | null,
  currentUser: DashboardDependencies["currentUser"],
): PolymarketOperationsDashboard["readiness"] => {
  const launchStatus = getSafeLaunchStatus();
  const clobSubmitterMode = launchStatus.clobSubmitterMode === "real" ? "real" : "disabled";
  const publicRoutedTradingEnabled = launchStatus.routedTradingEnabled;
  const betaRoutedTradingEnabled = launchStatus.routedTradingBetaEnabled;
  const submitterReady = clobSubmitterMode === "real";
  const attributionRecordingReady = process.env.POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED !== "true";
  const signatureVerifierImplemented = readBoolean("POLYMARKET_USER_SIGNATURE_VERIFIER_IMPLEMENTED", false);
  const l2CredentialLookupImplemented = readBoolean("POLYMARKET_L2_CREDENTIAL_LOOKUP_IMPLEMENTED", false);
  const serverGeoblockVerifierImplemented = readBoolean("POLYMARKET_GEOBLOCK_PROOF_VERIFIER_IMPLEMENTED", false);
  const runtime = process.env.DEPLOY_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  const ready =
     launchStatus.builderCodeConfigured &&
    (publicRoutedTradingEnabled || betaRoutedTradingEnabled) &&
    launchStatus.routedTradingCanaryOnly &&
    !launchStatus.routedTradingKillSwitch &&
    submitterReady &&
    attributionRecordingReady &&
    signatureVerifierImplemented &&
    l2CredentialLookupImplemented &&
    serverGeoblockVerifierImplemented;

  return {
    builderCodeConfigured: launchStatus.builderCodeConfigured,
    publicRoutedTradingEnabled,
    betaRoutedTradingEnabled,
    routedTradingEnabled: publicRoutedTradingEnabled || betaRoutedTradingEnabled,
    currentUserAllowlisted: isAllowlisted(currentUser),
    canaryOnly: launchStatus.routedTradingCanaryOnly,
    allowedUsersCount: launchStatus.routedTradingCanaryAllowlistCount,
    killSwitchActive: launchStatus.routedTradingKillSwitch,
    clobSubmitterMode,
    submitterReady,
    attributionRecordingReady,
    signatureVerifierImplemented,
    l2CredentialLookupImplemented,
    serverGeoblockVerifierImplemented,
    l2CredentialReadyCount: null,
    regionCheckStatus: serverGeoblockVerifierImplemented ? "implemented" : "missing",
    lastPreflightFailures: ready ? [] : [
      !publicRoutedTradingEnabled ? "public_routed_trading_disabled" : null,
      !betaRoutedTradingEnabled ? "beta_routed_trading_disabled" : null,
      !launchStatus.routedTradingCanaryOnly ? "canary_mode_required" : null,
      launchStatus.routedTradingKillSwitch ? "kill_switch_active" : null,
      launchStatus.routedTradingCanaryAllowlistCount === 0 ? "canary_allowlist_empty" : null,
      !submitterReady ? "submitter_unavailable" : null,
      !attributionRecordingReady ? "attribution_recording_unavailable" : null,
      !serverGeoblockVerifierImplemented ? "region_unknown" : null,
      !l2CredentialLookupImplemented ? "polymarket_l2_credentials_missing" : null,
    ].filter((value): value is string => Boolean(value)),
    lastSubmitAttempts: null,
    lastBuilderAttributionSync: overview?.tradeAttributions[0]?.observedAt ?? null,
    preflightStatus: ready ? (runtime === "staging" ? "ready_for_staging" : "ready_for_live") : "blocked",
  };
};

const getRewards = (
  overview: AmbassadorOverview | null,
): PolymarketOperationsDashboard["rewards"] => ({
  ambassadorCodesCount: overview?.codes.length ?? null,
  directReferralAttributionCount: overview?.attributions.length ?? null,
  pendingRewards: overview?.rewardLedger.filter((reward) => reward.status === "pending").length ?? null,
  payableRewards: overview?.rewardLedger.filter((reward) => reward.status === "payable").length ?? null,
  payoutRequests: overview?.payouts.filter((payout) => payout.status === "requested" || payout.status === "approved").length ?? null,
  openHighRiskFlags: overview?.riskFlags.filter((flag) => flag.status === "open" && flag.severity === "high").length ?? null,
  autoPayoutEnabled: getSafeLaunchStatus().autoPayoutEnabled,
});

export const getPolymarketOperationsDashboard = async (
  dependencies: DashboardDependencies = {},
): Promise<PolymarketOperationsDashboard> => {
  const now = dependencies.now ?? new Date();
  const countMarkets = dependencies.countBackendMarkets ?? countBackendPolymarketRows;
  const readGamma = dependencies.readGammaFallbackMarkets ?? readPolymarketGammaFallbackMarkets;
  const fetchPublicPath = dependencies.fetchPublicPath ?? defaultFetchPublicPath;
  const readOverview = dependencies.readAmbassadorOverview ?? (async () => null);
  let lastError: RedactedDashboardError | null = null;

  const [backendResult, gammaResult, publicPages, overviewResult] = await Promise.allSettled([
    countMarkets(),
    readGamma(),
    getPublicPages(fetchPublicPath),
    readOverview(),
  ]);

  if (backendResult.status === "rejected") {
    lastError = redactedError(backendResult.reason, "external_market_cache");
  }

  if (gammaResult.status === "rejected") {
    lastError = redactedError(gammaResult.reason, "gamma-api.polymarket.com/events");
  }

  return {
    marketDataHealth: {
      backendReachable: backendResult.status === "fulfilled",
      backendMarketCount: backendResult.status === "fulfilled" ? backendResult.value : null,
      gammaFallbackReachable: gammaResult.status === "fulfilled",
      gammaFallbackMarketCount: gammaResult.status === "fulfilled" ? gammaResult.value.length : null,
      lastCheckedAt: now.toISOString(),
      lastError,
    },
    publicPages: publicPages.status === "fulfilled"
      ? publicPages.value
      : {
          polymarketStatus: "unreachable",
          externalMarketsStatus: "unreachable",
          latestMarketCount: null,
          supabaseCacheReachable: null,
          newestLastSyncedAt: null,
          staleMarketCount: null,
          lastSyncStatus: null,
          fallbackUsedLastRequest: null,
          diagnosis: "unavailable",
        },
    readiness: getReadiness(overviewResult.status === "fulfilled" ? overviewResult.value : null, dependencies.currentUser),
    rewards: getRewards(overviewResult.status === "fulfilled" ? overviewResult.value : null),
  };
};
