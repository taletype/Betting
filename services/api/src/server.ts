import { createServer } from "node:http";

import { createDatabaseClient } from "@bet/db";
import { incrementCounter, logger } from "@bet/observability";
import type {
  ApiErrorResponse,
  ApiHealthResponse,
  ApiReadyResponse,
} from "@bet/contracts";

import {
  getExternalMarketBySourceAndId,
  getExternalMarketHistoryBySourceAndId,
  getExternalMarketOrderbookDepthBySourceAndId,
  getExternalMarketStatsBySourceAndId,
  getExternalMarketTradesBySourceAndId,
  listExternalMarkets,
} from "./modules/external-markets/handlers";
import {
  evaluateExternalPolymarketOrderReadiness,
  mapExternalPolymarketRoutingError,
  previewExternalPolymarketOrder,
  routeExternalPolymarketOrder,
  type ExternalPolymarketServerRegionCheck,
} from "./modules/external-polymarket-routing/handlers";
import {
  createPolymarketL2CredentialChallenge,
  getUserPolymarketL2CredentialStatus,
  isManualPolymarketL2CredentialInputEnabled,
  isPolymarketL2CredentialDerivationEnabled,
  revokeUserPolymarketL2Credentials,
  storeUserPolymarketL2Credentials,
  verifyPolymarketL2CredentialChallengeSignature,
} from "./modules/external-polymarket-routing/l2-credentials";
import { evaluatePolymarketPreflight } from "./modules/external-polymarket-routing/preflight";
import { runPolymarketBuilderAttributionSyncWithDependencies } from "./modules/external-polymarket-routing/builder-attribution-sync";
import { getHealth } from "./modules/health/handlers";
import {
  getMarketById,
  getOrderBookByMarketId,
  getTradesByMarketId,
  listMarkets,
} from "./modules/markets/handlers";
import { cancelOrder, createOrder } from "./modules/orders/handlers";
import { getPortfolio } from "./modules/portfolio/handlers";
import { resolveMarket } from "./modules/admin/handlers";
import { runExternalSync } from "./modules/admin/external-sync";
import { getDepositHistory, verifyDeposit } from "./modules/deposits/handlers";
import {
  approveAdminRewardPayout,
  captureReferralClick,
  captureAmbassadorReferral,
  createAdminAmbassadorCode,
  disableAdminAmbassadorCode,
  getAdminAmbassadorOverview,
  getAmbassadorDashboard,
  ingestBuilderRouteEvent,
  markAdminRewardPayoutPaid,
  markAdminBuilderTradeRewardsPayable,
  overrideAdminReferralAttribution,
  recordAdminMockBuilderTradeAttribution,
  requestAmbassadorRewardPayout,
  updateAdminRewardPayoutFailureState,
  voidAdminBuilderTradeAttribution,
} from "./modules/ambassador/handlers";
import {
  ambassadorPayoutRiskReviewRequiredCode,
  ambassadorPayoutRiskReviewRequiredMessage,
} from "./modules/ambassador/repository";
import {
  claimMarket,
  getClaimableStateForMarket,
  getClaims,
} from "./modules/claims/handlers";
import {
  executeWithdrawal,
  failWithdrawal,
  getRequestedWithdrawals,
  getWithdrawalHistory,
  requestWithdrawal,
} from "./modules/withdrawals/handlers";
import { createLinkWalletChallenge, getLinkedWallet, getWalletLinkDomain, linkBaseWallet, setLinkedWalletLookupForTests } from "./modules/wallets/handlers";
import { checkRateLimit } from "./modules/shared/rate-limit";
import {
  isDepositVerificationDisabled,
  isGlobalOrderPlacementDisabled,
  isOrderPlacementDisabledForMarket,
  isWithdrawalRequestDisabled,
} from "./modules/shared/kill-switches";
import {
  ApiAuthError,
  getAuthenticatedUser,
  isApiAdminUser,
  setApiAuthVerifierForTests,
  type AuthenticatedApiUser,
} from "./lib/auth/supabase";
import { toJson } from "./presenters/json";
import { validateApiEnvironment } from "./env";

const port = Number(process.env.PORT ?? 4000);

let captureAmbassadorReferralHandler = captureAmbassadorReferral;

const setAmbassadorCaptureHandlerForTests = (handler: typeof captureAmbassadorReferral | null): void => {
  captureAmbassadorReferralHandler = handler ?? captureAmbassadorReferral;
};

class ApiRequestBodyError extends Error {
  readonly status = 400;
  readonly code = "INVALID_JSON";
}

const parseBody = async (request: Request): Promise<Record<string, unknown>> => {
  const body = await request.text();
  if (!body) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new ApiRequestBodyError("invalid JSON body");
  }
};

const getServerRegionCheck = (request: Request): ExternalPolymarketServerRegionCheck => {
  const country = (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code") ??
    ""
  ).trim().toUpperCase();
  const region = (request.headers.get("x-vercel-ip-country-region") ?? request.headers.get("x-region-code") ?? "").trim() || null;
  const restricted = new Set((process.env.POLYMARKET_RESTRICTED_COUNTRIES ?? "US").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean));

  return {
    status: !country ? "unknown" : restricted.has(country) ? "blocked" : "allowed",
    country: country || null,
    region,
    checkedAt: new Date().toISOString(),
  };
};

const readIncomingMessage = async (request: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const requireAuthenticatedUser = (requestUserId: string | undefined): Response | null => {
  if (requestUserId) {
    return null;
  }

  const payload: ApiErrorResponse = { error: "authentication required" };
  return Response.json(payload, { status: 401 });
};

const requireAdminResponse = (user: AuthenticatedApiUser | null): Response | null => {
  if (!user) {
    const payload: ApiErrorResponse = { error: "authentication required" };
    return Response.json(payload, { status: 401 });
  }

  if (!isApiAdminUser(user)) {
    const payload: ApiErrorResponse = { error: "admin authorization required" };
    return Response.json(payload, { status: 403 });
  }

  return null;
};

const isProductionRuntime = (): boolean => process.env.NODE_ENV === "production";
const isInternalExchangeEnabled = (): boolean => process.env.INTERNAL_EXCHANGE_ENABLED === "true";
const privateNoStoreHeaders = { "cache-control": "private, no-store" };
type DashboardFailureCode =
  | "dashboard_auth_missing"
  | "dashboard_db_unavailable"
  | "ambassador_tables_missing"
  | "ambassador_code_create_failed"
  | "profile_missing";

const isDashboardPath = (pathname: string): boolean =>
  pathname === "/ambassador/dashboard" || pathname === "/ambassador/summary" || pathname === "/referrals/me";

const logDevelopmentDiagnostic = (code: string, metadata?: Record<string, unknown>): void => {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") return;
  logger.info(code, metadata ?? {});
};

const classifyDashboardDbError = (error: unknown): DashboardFailureCode => {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const pgCode = typeof record.code === "string" ? record.code : "";
  const message = error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "";

  if (pgCode === "42P01" || /relation .* does not exist|ambassador_codes|referral_attributions|ambassador_reward_ledger|ambassador_reward_payouts/i.test(message)) {
    return "ambassador_tables_missing";
  }
  if (pgCode === "23503" && /profiles|owner_user_id|recipient_user_id|referred_user_id|referrer_user_id/i.test(message)) {
    return "profile_missing";
  }
  if (/failed to (create|generate) ambassador code|ambassador code/i.test(message)) {
    return "ambassador_code_create_failed";
  }
  return "dashboard_db_unavailable";
};

const dashboardFailureResponse = (code: DashboardFailureCode, status = 500): Response => {
  logDevelopmentDiagnostic(code, { status, source: "service API" });
  return Response.json(
    {
      error: code === "ambassador_tables_missing"
        ? "Ambassador dashboard tables are missing. Apply the Supabase ambassador migrations."
        : "Ambassador dashboard is unavailable",
      code,
      source: "service API",
    },
    { status, headers: privateNoStoreHeaders },
  );
};

const isInternalExchangePublicPath = (segments: string[]): boolean => {
  const [resource, , action] = segments;
  if (!resource) return false;

  if (resource === "markets") return true;
  if (resource === "orders") return true;
  if (resource === "portfolio" && segments.length === 1) return true;
  if (resource === "claims" && (segments.length === 1 || segments.length === 2 || action === "state")) return true;
  if (resource === "deposits" && segments.length <= 2) return true;
  if (resource === "withdrawals" && segments.length === 1) return true;

  return false;
};

const internalExchangeDisabledResponse = (): Response =>
  Response.json(
    {
      error: "internal exchange routes are disabled for production beta",
      code: "INTERNAL_EXCHANGE_DISABLED",
    },
    { status: 404 },
  );

const safeErrorPayload = (error: unknown): ApiErrorResponse & { code?: string; message?: string } => {
  if (error instanceof ApiRequestBodyError) {
    return { error: "Invalid JSON body", code: error.code };
  }
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === ambassadorPayoutRiskReviewRequiredCode
  ) {
    return {
      error: ambassadorPayoutRiskReviewRequiredMessage,
      code: ambassadorPayoutRiskReviewRequiredCode,
      message: ambassadorPayoutRiskReviewRequiredMessage,
    };
  }
  if (!isProductionRuntime()) {
    return { error: error instanceof Error ? error.message : "Unknown error", code: "API_REQUEST_FAILED" };
  }
  return { error: "Request failed", code: "API_REQUEST_FAILED" };
};

const getAdminPolymarketStatus = async () => {
  const db = createDatabaseClient();
  const [marketCounts, staleCounts, lastRun, builderRuns, builderCounts, unmatchedFees, unmatchedAttempts, payoutExposure] = await Promise.all([
    db.query<{ total: string; open: string }>(
      `
        select
          count(*)::text as total,
          count(*) filter (where status = 'open')::text as open
        from public.external_markets
        where source = 'polymarket'
      `,
    ),
    db.query<{ stale: string; errored: string }>(
      `
        select
          count(*) filter (
            where coalesce(last_seen_at, last_synced_at, updated_at) < now() - interval '15 minutes'
          )::text as stale,
          count(*) filter (where sync_status = 'error')::text as errored
        from public.external_markets
        where source = 'polymarket'
      `,
    ),
    db.query<{
      sync_kind: string;
      status: string;
      started_at: Date | string;
      finished_at: Date | string | null;
      markets_seen: number;
      markets_upserted: number;
      error_message: string | null;
      diagnostics: unknown;
    }>(
      `
        select sync_kind, status, started_at, finished_at, markets_seen, markets_upserted, error_message, diagnostics
        from public.external_market_sync_runs
        where source = 'polymarket'
        order by started_at desc
        limit 10
      `,
    ),
    db.query<{
      id: string;
      source: string;
      started_at: Date | string;
      finished_at: Date | string | null;
      status: string;
      imported_count: number;
      matched_count: number;
      confirmed_count: number;
      disputed_count: number;
      voided_count: number;
      error_message: string | null;
      metadata_json: unknown;
    }>(
      `
        select id, source, started_at, finished_at, status, imported_count, matched_count,
               confirmed_count, disputed_count, voided_count, error_message, metadata_json
        from public.polymarket_builder_fee_reconciliation_runs
        order by started_at desc
        limit 10
      `,
    ),
    db.query<{
      imported: string;
      matched: string;
      confirmed: string;
      disputed: string;
      voided: string;
      rewards_from_confirmed: string;
    }>(
      `
        select
          count(*)::text as imported,
          count(*) filter (where fee.status = 'matched')::text as matched,
          count(*) filter (where fee.status = 'confirmed')::text as confirmed,
          count(*) filter (where fee.status = 'disputed')::text as disputed,
          count(*) filter (where fee.status = 'void')::text as voided,
          (
            select count(*)::text
            from public.ambassador_reward_ledger reward
            join public.builder_trade_attributions attribution
              on attribution.id = reward.source_trade_attribution_id
            where attribution.source_builder_fee_import_id is not null
              and attribution.status = 'confirmed'
          ) as rewards_from_confirmed
        from public.polymarket_builder_fee_imports fee
      `,
    ),
    db.query<{ id: string; external_order_id: string | null; external_trade_id: string | null; token_id: string | null; imported_at: Date | string }>(
      `
        select id, external_order_id, external_trade_id, token_id, imported_at
        from public.polymarket_builder_fee_imports
        where status = 'imported'
        order by imported_at desc
        limit 25
      `,
    ),
    db.query<{ id: string; polymarket_order_id: string | null; token_id: string; created_at: Date | string }>(
      `
        select audit.id, audit.polymarket_order_id, audit.token_id, audit.created_at
        from public.polymarket_routed_order_audits audit
        left join public.builder_trade_attributions attribution
          on attribution.polymarket_order_id = audit.polymarket_order_id
          or (
            audit.external_trade_id is not null
            and attribution.polymarket_trade_id = audit.external_trade_id
          )
        where audit.builder_code_attached = true
          and attribution.id is null
        order by audit.created_at desc
        limit 25
      `,
    ),
    db.query<{ approved_reserved: string; payable: string; requested_payouts: string; approved_payouts: string }>(
      `
        select
          coalesce(sum(amount_usdc_atoms) filter (where status = 'approved' and reserved_by_payout_id is not null), 0)::text as approved_reserved,
          coalesce(sum(amount_usdc_atoms) filter (where status = 'payable'), 0)::text as payable,
          (select count(*)::text from public.ambassador_reward_payouts where status = 'requested') as requested_payouts,
          (select count(*)::text from public.ambassador_reward_payouts where status = 'approved') as approved_payouts
        from public.ambassador_reward_ledger
      `,
    ),
  ]);

  return {
    source: "polymarket",
    marketCounts: {
      total: Number(marketCounts[0]?.total ?? 0),
      open: Number(marketCounts[0]?.open ?? 0),
      stale: Number(staleCounts[0]?.stale ?? 0),
      errored: Number(staleCounts[0]?.errored ?? 0),
    },
    preflight: evaluatePolymarketPreflight(),
    syncCadence: {
      metadata: "5-15 minutes",
      hotMarketPrices: "15-60 seconds",
      orderbookSnapshots: "30-120 seconds for hot/detail markets",
      recentTrades: "1-5 minutes",
      staleness: "1-5 minutes",
    },
    recentRuns: lastRun.map((run) => ({
      syncKind: run.sync_kind,
      status: run.status,
      startedAt: run.started_at instanceof Date ? run.started_at.toISOString() : new Date(run.started_at).toISOString(),
      finishedAt: run.finished_at ? (run.finished_at instanceof Date ? run.finished_at.toISOString() : new Date(run.finished_at).toISOString()) : null,
      marketsSeen: run.markets_seen,
      marketsUpserted: run.markets_upserted,
      errorMessage: run.error_message,
      diagnostics: run.diagnostics,
    })),
    builderFeeReconciliation: {
      builderCodeConfigured: evaluatePolymarketPreflight().builderCodeConfigured,
      evidenceSourceConfigured: Boolean(process.env.POLYMARKET_BUILDER_FEE_EVIDENCE_URL?.trim()),
      latestRunStatus: builderRuns[0]?.status ?? null,
      lastError: builderRuns[0]?.error_message ?? null,
      counts: {
        imported: Number(builderCounts[0]?.imported ?? 0),
        matched: Number(builderCounts[0]?.matched ?? 0),
        confirmed: Number(builderCounts[0]?.confirmed ?? 0),
        disputed: Number(builderCounts[0]?.disputed ?? 0),
        voided: Number(builderCounts[0]?.voided ?? 0),
        rewardRowsFromConfirmedEvidence: Number(builderCounts[0]?.rewards_from_confirmed ?? 0),
      },
      recentRuns: builderRuns.map((run) => ({
        id: run.id,
        source: run.source,
        status: run.status,
        startedAt: run.started_at instanceof Date ? run.started_at.toISOString() : new Date(run.started_at).toISOString(),
        finishedAt: run.finished_at ? (run.finished_at instanceof Date ? run.finished_at.toISOString() : new Date(run.finished_at).toISOString()) : null,
        importedCount: run.imported_count,
        matchedCount: run.matched_count,
        confirmedCount: run.confirmed_count,
        disputedCount: run.disputed_count,
        voidedCount: run.voided_count,
        errorMessage: run.error_message,
        metadata: run.metadata_json,
      })),
      unmatchedFeeEvidence: unmatchedFees.map((fee) => ({
        id: fee.id,
        externalOrderId: fee.external_order_id,
        externalTradeId: fee.external_trade_id,
        tokenId: fee.token_id,
        importedAt: fee.imported_at instanceof Date ? fee.imported_at.toISOString() : new Date(fee.imported_at).toISOString(),
      })),
      unmatchedRoutedAttempts: unmatchedAttempts.map((attempt) => ({
        id: attempt.id,
        polymarketOrderId: attempt.polymarket_order_id,
        tokenId: attempt.token_id,
        createdAt: attempt.created_at instanceof Date ? attempt.created_at.toISOString() : new Date(attempt.created_at).toISOString(),
      })),
      payoutExposure: {
        approvedReservedUsdcAtoms: payoutExposure[0]?.approved_reserved ?? "0",
        payableUsdcAtoms: payoutExposure[0]?.payable ?? "0",
        requestedPayouts: Number(payoutExposure[0]?.requested_payouts ?? 0),
        approvedPayouts: Number(payoutExposure[0]?.approved_payouts ?? 0),
      },
    },
  };
};

const handleRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  try {
    const requestUser = await getAuthenticatedUser(request);
    const requestUserId = requestUser?.id;
    const actorIdentity = requestUserId ?? "anonymous";
    const idempotencyKey = request.headers.get("idempotency-key");
    const segments = url.pathname.split("/").filter(Boolean);

    if (request.method === "GET" && url.pathname === "/health") {
      const payload = getHealth() as ApiHealthResponse;
      return Response.json(payload);
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      const db = createDatabaseClient();
      await db.query("select 1");
      const payload: ApiReadyResponse = { ok: true, service: "api", ready: true, checkedAt: new Date().toISOString() };
      return Response.json(payload);
    }

    if (request.method === "POST" && url.pathname === "/admin/external-sync/run") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const source = url.searchParams.get("source") ?? undefined;
      const payload = await runExternalSync(source);
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 202,
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/polymarket/preflight") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      return Response.json(evaluatePolymarketPreflight());
    }

    if (request.method === "GET" && url.pathname === "/admin/polymarket/status") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      return Response.json(await getAdminPolymarketStatus());
    }

    if (request.method === "POST" && url.pathname === "/admin/polymarket/builder-fees/reconcile") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      return Response.json(await runPolymarketBuilderAttributionSyncWithDependencies({ createdBy: requestUser!.id }), { status: 202 });
    }

    if (request.method === "POST" && url.pathname === "/polymarket/orders/preflight") {
      const body = await parseBody(request);
      try {
        const payload = await evaluateExternalPolymarketOrderReadiness(body, {
          requestUserId,
          requestUserEmail: requestUser?.email ?? null,
          serverRegionCheck: getServerRegionCheck(request),
        });
        return Response.json(payload);
      } catch {
        return Response.json({
          ok: false,
          state: "routed_trading_disabled",
          disabledReasons: ["routed_trading_disabled"],
          error: "Polymarket order preflight failed safely",
        }, { status: 200 });
      }
    }

    if (request.method === "POST" && url.pathname === "/polymarket/orders/preview") {
      const body = await parseBody(request);
      try {
        const payload = await previewExternalPolymarketOrder(body, {
          requestUserId,
          requestUserEmail: requestUser?.email ?? null,
          serverRegionCheck: getServerRegionCheck(request),
        });
        return Response.json(payload);
      } catch {
        return Response.json({
          ok: false,
          disabledReason: "routed_trading_disabled",
          userMustSignWarning: "用戶自行簽署訂單",
          nonCustodialWarning: "本平台不託管用戶在 Polymarket 的資金",
          platformNoTradeWarning: "本平台不會代用戶下注或交易",
        }, { status: 200 });
      }
    }

    if (request.method === "POST" && url.pathname === "/polymarket/orders/submit") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;

      const rateLimit = checkRateLimit("polymarketRoutedTrade", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "polymarket_routed_trade" });
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const body = await parseBody(request);
      const region = getServerRegionCheck(request);
      const serverGeoblock = region.status === "allowed"
        ? { blocked: false as const, checkedAt: region.checkedAt, country: region.country, region: region.region }
        : body.geoblock;

      try {
        const payload = await routeExternalPolymarketOrder(
          { ...body, geoblock: serverGeoblock },
          {
            requestUserId,
            requestUserEmail: requestUser?.email ?? null,
            serverRegionCheck: region,
            geoblockProofVerifier: async () => region.status === "allowed",
          },
        );
        return new Response(toJson(payload), {
          headers: { "content-type": "application/json" },
          status: 202,
        });
      } catch (error) {
        const mapped = mapExternalPolymarketRoutingError(error);
        return Response.json(mapped.payload, { status: mapped.status });
      }
    }

    if (request.method === "POST" && url.pathname === "/referrals/click") {
      const body = await parseBody(request);
      const payload = await captureReferralClick({
        rawCode: String(body.code ?? body.ref ?? body.rawCode ?? ""),
        landingPath: body.landingPath ? String(body.landingPath) : url.searchParams.get("landingPath") ?? "/",
        queryRef: body.queryRef ? String(body.queryRef) : null,
        anonymousSessionId: body.anonymousSessionId ? String(body.anonymousSessionId) : body.sessionId ? String(body.sessionId) : null,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" }, status: 202 });
    }

    if (request.method === "POST" && url.pathname === "/internal/builder-route-events") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      const body = await parseBody(request);
      const payload = await ingestBuilderRouteEvent({
        eventId: body.eventId ? String(body.eventId) : body.event_id ? String(body.event_id) : null,
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : body.idempotency_key ? String(body.idempotency_key) : null,
        eventType: String(body.eventType ?? body.event_type ?? ""),
        appUserId: body.appUserId ? String(body.appUserId) : body.app_user_id ? String(body.app_user_id) : null,
        walletAddress: body.walletAddress ? String(body.walletAddress) : body.wallet_address ? String(body.wallet_address) : null,
        marketExternalId: body.marketExternalId ? String(body.marketExternalId) : body.market_external_id ? String(body.market_external_id) : null,
        externalOrderId: body.externalOrderId ? String(body.externalOrderId) : body.external_order_id ? String(body.external_order_id) : null,
        externalTradeId: body.externalTradeId ? String(body.externalTradeId) : body.external_trade_id ? String(body.external_trade_id) : null,
        source: body.source ? String(body.source) : "polymarket",
        builderCode: body.builderCode ? String(body.builderCode) : body.builder_code ? String(body.builder_code) : null,
        side: body.side === "maker" || body.side === "taker" ? body.side : "unknown",
        notionalAmountAtoms: body.notionalAmountAtoms || body.notional_amount ? BigInt(String(body.notionalAmountAtoms ?? body.notional_amount)) : null,
        builderFeeBps: body.builderFeeBps || body.builder_fee_bps ? Number(body.builderFeeBps ?? body.builder_fee_bps) : null,
        builderFeeAmountAtoms: body.builderFeeAmountAtoms || body.builder_fee_amount ? BigInt(String(body.builderFeeAmountAtoms ?? body.builder_fee_amount)) : null,
        asset: body.asset ? String(body.asset) : null,
        rawReferenceId: body.rawReferenceId ? String(body.rawReferenceId) : body.raw_reference_id ? String(body.raw_reference_id) : null,
        occurredAt: body.occurredAt ? String(body.occurredAt) : body.occurred_at ? String(body.occurred_at) : null,
        rawJson: body,
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" }, status: 202 });
    }

    if (request.method === "POST" && url.pathname === "/internal/builder-fee-confirmations") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      return Response.json(await runPolymarketBuilderAttributionSyncWithDependencies({ createdBy: requestUser!.id }), { status: 202 });
    }

    if (request.method === "GET" && url.pathname === "/external/markets") {
      const rateLimit = checkRateLimit("publicMarkets", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "public_markets" });
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }
      const payload = await listExternalMarkets();
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/external/polymarket/orders/route") {
      const rateLimit = checkRateLimit("polymarketRoutedTrade", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "polymarket_routed_trade" });
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const body = await parseBody(request);

      try {
        const payload = await routeExternalPolymarketOrder(body, {
          requestUserId,
          requestUserEmail: requestUser?.email ?? null,
        });
        return new Response(toJson(payload), {
          headers: { "content-type": "application/json" },
          status: 202,
        });
      } catch (error) {
        const mapped = mapExternalPolymarketRoutingError(error);
        return Response.json(mapped.payload, { status: mapped.status });
      }
    }

    if (
      request.method === "GET" &&
      segments.length >= 5 &&
      segments[0] === "external" &&
      segments[1] === "markets" &&
      segments[4] === "history"
    ) {
      const source = segments[2] ?? "";
      const externalId = decodeURIComponent(segments[3] ?? "");
      const history = await getExternalMarketHistoryBySourceAndId(source, externalId);
      return new Response(toJson({ source, externalId, history }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      segments.length >= 5 &&
      segments[0] === "external" &&
      segments[1] === "markets" &&
      segments[4] === "stats"
    ) {
      const stats = await getExternalMarketStatsBySourceAndId(segments[2] ?? "", decodeURIComponent(segments[3] ?? ""));
      return new Response(toJson(stats), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      segments.length >= 5 &&
      segments[0] === "external" &&
      segments[1] === "markets" &&
      segments[4] === "trades"
    ) {
      const trades = await getExternalMarketTradesBySourceAndId(segments[2] ?? "", decodeURIComponent(segments[3] ?? ""));
      return new Response(
        toJson({
          source: segments[2] ?? "",
          externalId: decodeURIComponent(segments[3] ?? ""),
          trades: trades ?? [],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    }

    if (
      request.method === "GET" &&
      segments.length >= 5 &&
      segments[0] === "external" &&
      segments[1] === "markets" &&
      segments[4] === "orderbook"
    ) {
      const payload = await getExternalMarketBySourceAndId(segments[2] ?? "", decodeURIComponent(segments[3] ?? ""));
      const depth = await getExternalMarketOrderbookDepthBySourceAndId(segments[2] ?? "", decodeURIComponent(segments[3] ?? ""));
      return new Response(toJson({ orderbook: payload?.latestOrderbook ?? [], depth }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/external/markets/")) {
      const [, , , source, ...idParts] = url.pathname.split("/");
      const externalId = decodeURIComponent(idParts.join("/"));
      const market = await getExternalMarketBySourceAndId(source ?? "", externalId);
      const payload = { market };
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: market ? 200 : 404,
      });
    }

    if (!isInternalExchangeEnabled() && isInternalExchangePublicPath(segments)) {
      return internalExchangeDisabledResponse();
    }

    if (request.method === "GET" && url.pathname === "/markets") {
      const payload = await listMarkets();
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "markets" &&
      segments[2] === "orderbook"
    ) {
      const payload = await getOrderBookByMarketId(segments[1] ?? "");
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "markets" &&
      segments[2] === "trades"
    ) {
      const payload = await getTradesByMarketId(segments[1] ?? "");
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "markets") {
      const market = await getMarketById(segments[1] ?? "");
      const payload = { market };
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: market ? 200 : 404,
      });
    }

    if (request.method === "POST" && url.pathname === "/orders") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseBody(request);
      const marketId = String(body.marketId ?? "");

      if (isGlobalOrderPlacementDisabled()) {
        const payload: ApiErrorResponse = {
          error: "order placement is temporarily disabled",
        };
        return Response.json(payload, { status: 503 });
      }

      if (isOrderPlacementDisabledForMarket(marketId)) {
        const payload: ApiErrorResponse = {
          error: "order placement is temporarily disabled for this market",
        };
        return Response.json(payload, { status: 503 });
      }

      const rateLimit = checkRateLimit("orderPlacement", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "orders" });
        const payload: ApiErrorResponse = { error: "rate limit exceeded" };
        return Response.json(
          payload,
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const result = await createOrder({
        userId: requestUserId!,
        marketId,
        outcomeId: String(body.outcomeId ?? ""),
        side: body.side === "sell" ? "sell" : "buy",
        orderType: body.orderType === "market" ? "market" : "limit",
        price: BigInt(String(body.price ?? "0")),
        quantity: BigInt(String(body.quantity ?? "0")),
        clientOrderId: body.clientOrderId ? String(body.clientOrderId) : null,
        idempotencyKey,
      });

      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 202,
      });
    }

    if (request.method === "DELETE" && segments.length === 2 && segments[0] === "orders") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const rateLimit = checkRateLimit("orderCancel", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "order_cancel" });
        const payload: ApiErrorResponse = { error: "rate limit exceeded" };
        return Response.json(
          payload,
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const result = await cancelOrder({ orderId: segments[1] ?? "" });
      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    if (request.method === "GET" && url.pathname === "/portfolio") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const payload = await getPortfolio(requestUserId);
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/claims") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const payload = await getClaims({ userId: requestUserId });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && segments.length === 3 && segments[0] === "claims" && segments[2] === "state") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const payload = await getClaimableStateForMarket({
        marketId: segments[1] ?? "",
        userId: requestUserId!,
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && segments.length === 2 && segments[0] === "claims") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const payload = await claimMarket({
        marketId: segments[1] ?? "",
        userId: requestUserId,
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/wallets/linked") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      return new Response(toJson({ wallet: await getLinkedWallet(requestUserId) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/wallets/me") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      return new Response(toJson({ wallets: [await getLinkedWallet(requestUserId)].filter(Boolean) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/polymarket/l2-credentials/status") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      const userId = requestUserId!;

      return Response.json(await getUserPolymarketL2CredentialStatus(userId), { headers: privateNoStoreHeaders });
    }

    if (request.method === "DELETE" && url.pathname === "/polymarket/l2-credentials") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      const userId = requestUserId!;

      await revokeUserPolymarketL2Credentials(userId);
      const status = await getUserPolymarketL2CredentialStatus(userId);
      return Response.json(status, { headers: privateNoStoreHeaders });
    }

    if (request.method === "POST" && url.pathname === "/polymarket/l2-credentials/challenge") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      const userId = requestUserId!;

      const linkedWallet = await getLinkedWallet(userId);
      if (!linkedWallet?.walletAddress || !linkedWallet.verifiedAt) {
        return Response.json({ error: "verified linked wallet is required", code: "POLYMARKET_WALLET_NOT_VERIFIED" }, { status: 403, headers: privateNoStoreHeaders });
      }
      const challenge = createPolymarketL2CredentialChallenge({
        userId,
        walletAddress: linkedWallet.walletAddress,
        domain: getWalletLinkDomain(request.headers.get("host")),
      });
      return Response.json(challenge, { status: 201, headers: privateNoStoreHeaders });
    }

    if (request.method === "POST" && url.pathname === "/polymarket/l2-credentials/derive") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      const userId = requestUserId!;

      const linkedWallet = await getLinkedWallet(userId);
      if (!linkedWallet?.walletAddress || !linkedWallet.verifiedAt) {
        return Response.json({ error: "verified linked wallet is required", code: "POLYMARKET_WALLET_NOT_VERIFIED" }, { status: 403, headers: privateNoStoreHeaders });
      }
      const body = await parseBody(request);
      try {
        verifyPolymarketL2CredentialChallengeSignature({
          userId,
          walletAddress: linkedWallet.walletAddress,
          domain: getWalletLinkDomain(request.headers.get("host")),
          signedMessage: String(body.signedMessage ?? ""),
          signature: String(body.signature ?? ""),
        });
      } catch {
        return Response.json({ error: "signature does not match verified wallet", code: "POLYMARKET_WALLET_SIGNATURE_MISMATCH" }, { status: 400, headers: privateNoStoreHeaders });
      }
      if (!isPolymarketL2CredentialDerivationEnabled()) {
        return Response.json({ error: "Polymarket L2 credential derivation is not enabled", code: "POLYMARKET_L2_SETUP_UNAVAILABLE" }, { status: 503, headers: privateNoStoreHeaders });
      }
      return Response.json({ error: "Polymarket L2 credential derivation is not implemented", code: "POLYMARKET_L2_SETUP_UNAVAILABLE" }, { status: 503, headers: privateNoStoreHeaders });
    }

    if (request.method === "POST" && url.pathname === "/polymarket/l2-credentials") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      if (!isManualPolymarketL2CredentialInputEnabled()) {
        return Response.json({ error: "manual Polymarket L2 credential input is disabled", code: "POLYMARKET_MANUAL_L2_CREDENTIALS_DISABLED" }, { status: 404, headers: privateNoStoreHeaders });
      }
      const userId = requestUserId!;

      const linkedWallet = await getLinkedWallet(userId);
      if (!linkedWallet?.walletAddress || !linkedWallet.verifiedAt) {
        return Response.json({ error: "verified linked wallet is required", code: "POLYMARKET_WALLET_NOT_VERIFIED" }, { status: 403 });
      }
      const body = await parseBody(request);
      const walletAddress = String(body.walletAddress ?? linkedWallet.walletAddress).trim().toLowerCase();
      if (walletAddress !== linkedWallet.walletAddress.toLowerCase()) {
        return Response.json({ error: "wallet mismatch", code: "POLYMARKET_WALLET_MISMATCH" }, { status: 400 });
      }
      const credentials = body.credentials && typeof body.credentials === "object"
        ? body.credentials as { key?: unknown; secret?: unknown; passphrase?: unknown }
        : body;
      await storeUserPolymarketL2Credentials({
        userId,
        walletAddress: linkedWallet.walletAddress,
        credentials: {
          key: String(credentials.key ?? ""),
          secret: String(credentials.secret ?? ""),
          passphrase: String(credentials.passphrase ?? ""),
        },
      });
      return Response.json(await getUserPolymarketL2CredentialStatus(userId), { status: 201, headers: privateNoStoreHeaders });
    }

    if (request.method === "POST" && url.pathname === "/wallets/link/challenge") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseBody(request);
      const payload = await createLinkWalletChallenge({
        userId: requestUserId,
        walletAddress: String(body.walletAddress ?? ""),
        chain: String(body.chain ?? "base"),
        domain: getWalletLinkDomain(request.headers.get("host")),
      });
      return Response.json(payload, { status: 201 });
    }

    if (request.method === "POST" && (url.pathname === "/wallets/link" || url.pathname === "/wallets/bind" || url.pathname === "/wallets/verify")) {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseBody(request);
      const linkedWallet = await linkBaseWallet({
        userId: requestUserId,
        walletAddress: String(body.walletAddress ?? ""),
        chain: String(body.chain ?? "base"),
        challengeId: body.challengeId ? String(body.challengeId) : undefined,
        signature: String(body.signature ?? ""),
        signedMessage: String(body.signedMessage ?? ""),
        domain: getWalletLinkDomain(request.headers.get("host")),
      });

      return new Response(toJson({ wallet: linkedWallet }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "DELETE" && segments.length === 2 && segments[0] === "wallets") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      const db = createDatabaseClient();
      await db.query(`delete from public.linked_wallets where id = $1::uuid and user_id = $2::uuid`, [segments[1] ?? "", requestUserId]);
      await db.query(
        `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
         values ($1::uuid, 'wallet_unbound', 'linked_wallet', $2, '{}'::jsonb, now())`,
        [requestUserId, segments[1] ?? ""],
      );
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/deposits") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const payload = { deposits: await getDepositHistory(requestUserId) };
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && (url.pathname === "/ambassador/dashboard" || url.pathname === "/ambassador/summary" || url.pathname === "/referrals/me")) {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        logDevelopmentDiagnostic("dashboard_auth_missing", { status: 401, source: "service API" });
        return unauthorized;
      }

      let payload: Awaited<ReturnType<typeof getAmbassadorDashboard>>;
      try {
        payload = await getAmbassadorDashboard(requestUserId);
      } catch (error) {
        return dashboardFailureResponse(classifyDashboardDbError(error));
      }
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json", ...privateNoStoreHeaders },
      });
    }

    if (request.method === "POST" && (url.pathname === "/ambassador/capture" || url.pathname === "/referrals/apply")) {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const rateLimit = checkRateLimit("ambassadorReferral", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "ambassador_referral" });
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const body = await parseBody(request);
      const payload = await captureAmbassadorReferralHandler({
        userId: requestUserId,
        code: String(body.code ?? body.ref ?? ""),
        ...(body.idempotencyKey ? { idempotencyKey: String(body.idempotencyKey) } : {}),
        ...(body.sessionId ? { sessionId: String(body.sessionId) } : {}),
        ...(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")
          ? { ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") }
          : {}),
        ...(request.headers.get("user-agent") ? { userAgent: request.headers.get("user-agent") } : {}),
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && (url.pathname === "/rewards/summary" || url.pathname === "/rewards/ledger" || url.pathname === "/rewards/payout-requests")) {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) return unauthorized;
      const dashboard = await getAmbassadorDashboard(requestUserId);
      const payload = url.pathname.endsWith("/summary")
        ? { rewards: dashboard.rewards }
        : url.pathname.endsWith("/ledger")
          ? { rewardLedger: dashboard.rewardLedger }
          : { payoutRequests: dashboard.payouts };
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (request.method === "POST" && (url.pathname === "/ambassador/payouts" || url.pathname === "/rewards/payout-requests")) {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const rateLimit = checkRateLimit("ambassadorPayout", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "ambassador_payout" });
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const body = await parseBody(request);
      const payload = await requestAmbassadorRewardPayout({
        userId: requestUserId,
        destinationType: body.destinationType === "manual" ? "manual" : "wallet",
        destinationValue: String(body.destinationValue ?? ""),
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }

    if (request.method === "POST" && url.pathname === "/deposits/verify") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      if (isDepositVerificationDisabled()) {
        const payload: ApiErrorResponse = {
          error: "deposit verification is temporarily disabled",
        };
        return Response.json(payload, { status: 503 });
      }

      const body = await parseBody(request);
      const result = await verifyDeposit({
        userId: requestUserId,
        txHash: String(body.txHash ?? ""),
      });
      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/withdrawals") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const payload = { withdrawals: await getWithdrawalHistory(requestUserId) };
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/withdrawals") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      if (isWithdrawalRequestDisabled()) {
        const payload: ApiErrorResponse = {
          error: "withdrawal requests are temporarily disabled",
        };
        return Response.json(payload, { status: 503 });
      }

      const body = await parseBody(request);
      const result = await requestWithdrawal({
        userId: requestUserId,
        amountAtoms: BigInt(String(body.amountAtoms ?? "0")),
        destinationAddress: String(body.destinationAddress ?? ""),
      });
      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "markets" &&
      segments[3] === "resolve"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const result = await resolveMarket({
        marketId: segments[2] ?? "",
        winningOutcomeId: String(body.winningOutcomeId ?? ""),
        evidenceText: String(body.evidenceText ?? ""),
        evidenceUrl: body.evidenceUrl ? String(body.evidenceUrl) : null,
        resolverId: String(body.resolverId ?? ""),
        isAdmin: true,
      });
      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/withdrawals") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      return new Response(toJson({ withdrawals: await getRequestedWithdrawals({ isAdmin: true }) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      (
        url.pathname === "/admin/ambassador" ||
        url.pathname === "/admin/referrals" ||
        url.pathname === "/admin/rewards" ||
        url.pathname === "/admin/payouts" ||
        url.pathname === "/admin/polymarket/builder-attributions"
      )
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const payload = await getAdminAmbassadorOverview();
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/admin/ambassador/referral-attributions/override") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      await overrideAdminReferralAttribution({
        adminUserId: requestUser!.id,
        referredUserId: String(body.referredUserId ?? ""),
        ambassadorCode: String(body.ambassadorCode ?? body.code ?? ""),
        reason: String(body.reason ?? ""),
      });
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/admin/ambassador/codes") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const payload = await createAdminAmbassadorCode({
        adminUserId: requestUser!.id,
        ownerUserId: String(body.ownerUserId ?? ""),
        code: body.code ? String(body.code) : null,
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }

    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "admin" &&
      segments[1] === "ambassador" &&
      segments[2] === "codes" &&
      segments[4] === "disable"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const payload = await disableAdminAmbassadorCode({
        adminUserId: requestUser!.id,
        codeId: segments[3] ?? "",
        reason: String(body.reason ?? ""),
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/admin/ambassador/trade-attributions/mock") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const payload = await recordAdminMockBuilderTradeAttribution({
        adminUserId: requestUser!.id,
        userId: String(body.userId ?? ""),
        polymarketOrderId: body.polymarketOrderId ? String(body.polymarketOrderId) : null,
        polymarketTradeId: body.polymarketTradeId ? String(body.polymarketTradeId) : null,
        marketSlug: body.marketSlug ? String(body.marketSlug) : null,
        conditionId: body.conditionId ? String(body.conditionId) : null,
        notionalUsdcAtoms: BigInt(String(body.notionalUsdcAtoms ?? "0")),
        builderFeeUsdcAtoms: BigInt(String(body.builderFeeUsdcAtoms ?? "0")),
        status: body.status === "confirmed" || body.status === "void" ? body.status : "pending",
        rawJson: { requestBody: body },
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }

    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "admin" &&
      segments[1] === "ambassador" &&
      segments[2] === "trade-attributions" &&
      segments[4] === "payable"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const payload = await markAdminBuilderTradeRewardsPayable({
        adminUserId: requestUser!.id,
        tradeAttributionId: segments[3] ?? "",
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "admin" &&
      segments[1] === "ambassador" &&
      segments[2] === "risk-flags" &&
      (segments[4] === "review" || segments[4] === "dismiss")
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      const body = await parseBody(request);
      const status = segments[4] === "review" ? "reviewed" : "dismissed";
      const db = createDatabaseClient();
      await db.query(
        `
          update public.ambassador_risk_flags
             set status = $3,
                 reviewed_by = $2::uuid,
                 reviewed_at = now(),
                 review_notes = $4
           where id = $1::uuid
             and status = 'open'
        `,
        [segments[3] ?? "", requestUser!.id, status, String(body.reviewNotes ?? body.notes ?? "")],
      );
      await db.query(
        `
          insert into public.admin_audit_log (
            actor_user_id, actor_admin_user_id, action, entity_type, target_type, entity_id, target_id,
            before_status, after_status, note, metadata, created_at
          ) values ($1::uuid, $1::uuid, $2, 'ambassador_risk_flag', 'ambassador_risk_flag', $3, $3, 'open', $4, $5, '{}'::jsonb, now())
        `,
        [requestUser!.id, segments[4] === "review" ? "risk_flag.review" : "risk_flag.dismiss", segments[3] ?? "", status, String(body.reviewNotes ?? body.notes ?? "")],
      );
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/admin/payouts/export.csv") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      const overview = await getAdminAmbassadorOverview();
      const csv = [
        "id,recipient_user_id,amount_usdc_atoms,status,payout_chain,payout_asset,destination_type,destination_value,tx_hash",
        ...overview.payouts.map((payout) => [
          payout.id,
          payout.recipientUserId,
          payout.amountUsdcAtoms.toString(),
          payout.status,
          payout.payoutChain,
          payout.payoutAsset,
          payout.destinationType,
          payout.destinationValue.replaceAll(",", " "),
          payout.txHash ?? "",
        ].join(",")),
      ].join("\n");
      return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "payouts" &&
      segments[3] === "approve"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      const body = await parseBody(request);
      const payload = await approveAdminRewardPayout({
        adminUserId: requestUser!.id,
        payoutId: segments[2] ?? "",
        notes: body.notes ? String(body.notes) : null,
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "payouts" &&
      segments[3] === "mark-paid"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      const body = await parseBody(request);
      const payload = await markAdminRewardPayoutPaid({
        adminUserId: requestUser!.id,
        payoutId: segments[2] ?? "",
        txHash: body.txHash ? String(body.txHash) : null,
        notes: body.notes ? String(body.notes) : null,
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "payouts" &&
      (segments[3] === "mark-failed" || segments[3] === "cancel")
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;
      const body = await parseBody(request);
      const payload = await updateAdminRewardPayoutFailureState({
        adminUserId: requestUser!.id,
        payoutId: segments[2] ?? "",
        status: segments[3] === "mark-failed" ? "failed" : "cancelled",
        notes: String(body.notes ?? ""),
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "admin" &&
      segments[1] === "ambassador" &&
      segments[2] === "trade-attributions" &&
      segments[4] === "void"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      await voidAdminBuilderTradeAttribution({
        adminUserId: requestUser!.id,
        tradeAttributionId: segments[3] ?? "",
        reason: String(body.reason ?? ""),
      });
      return Response.json({ ok: true });
    }

    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "admin" &&
      segments[1] === "ambassador" &&
      segments[2] === "payouts" &&
      segments[4] === "approve"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const payload = await approveAdminRewardPayout({
        adminUserId: requestUser!.id,
        payoutId: segments[3] ?? "",
        notes: body.notes ? String(body.notes) : null,
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "admin" &&
      segments[1] === "ambassador" &&
      segments[2] === "payouts" &&
      segments[4] === "paid"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const payload = await markAdminRewardPayoutPaid({
        adminUserId: requestUser!.id,
        payoutId: segments[3] ?? "",
        txHash: body.txHash ? String(body.txHash) : null,
        notes: body.notes ? String(body.notes) : null,
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 5 &&
      segments[0] === "admin" &&
      segments[1] === "ambassador" &&
      segments[2] === "payouts" &&
      (segments[4] === "failed" || segments[4] === "cancelled")
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const payload = await updateAdminRewardPayoutFailureState({
        adminUserId: requestUser!.id,
        payoutId: segments[3] ?? "",
        status: segments[4],
        notes: String(body.notes ?? ""),
      });
      return new Response(toJson(payload), { headers: { "content-type": "application/json" } });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "withdrawals" &&
      segments[3] === "execute"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const result = await executeWithdrawal({
        adminUserId: requestUser!.id,
        isAdmin: true,
        withdrawalId: segments[2] ?? "",
        txHash: String(body.txHash ?? ""),
      });
      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/withdrawals") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      return new Response(toJson({ withdrawals: await getWithdrawalHistory(requestUserId) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/withdrawals") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      if (isWithdrawalRequestDisabled()) {
        const payload: ApiErrorResponse = {
          error: "withdrawal requests are temporarily disabled",
        };
        return Response.json(payload, { status: 503 });
      }

      const body = await parseBody(request);
      const result = await requestWithdrawal({
        userId: requestUserId,
        amountAtoms: BigInt(String(body.amountAtoms ?? "0")),
        destinationAddress: String(body.destinationAddress ?? ""),
      });
      return new Response(toJson(result), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "markets" &&
      segments[3] === "resolve"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const result = await resolveMarket({
        marketId: segments[2] ?? "",
        winningOutcomeId: String(body.winningOutcomeId ?? ""),
        evidenceText: String(body.evidenceText ?? ""),
        evidenceUrl: body.evidenceUrl ? String(body.evidenceUrl) : null,
        resolverId: String(body.resolverId ?? ""),
        isAdmin: true,
      });
      return new Response(toJson(result), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/withdrawals") {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      return new Response(toJson({ withdrawals: await getRequestedWithdrawals({ isAdmin: true }) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "withdrawals" &&
      segments[3] === "execute"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const result = await executeWithdrawal({
        adminUserId: requestUser!.id,
        isAdmin: true,
        withdrawalId: segments[2] ?? "",
        txHash: String(body.txHash ?? ""),
      });
      return new Response(toJson(result), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "withdrawals" &&
      segments[3] === "fail"
    ) {
      const unauthorizedAdmin = requireAdminResponse(requestUser);
      if (unauthorizedAdmin) return unauthorizedAdmin;

      const body = await parseBody(request);
      const result = await failWithdrawal({
        adminUserId: requestUser!.id,
        isAdmin: true,
        withdrawalId: segments[2] ?? "",
        reason: String(body.reason ?? ""),
      });
      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }


    const payload: ApiErrorResponse = { error: "Not found" };
    return Response.json(payload, { status: 404 });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    if (isDashboardPath(url.pathname)) {
      return dashboardFailureResponse(classifyDashboardDbError(error));
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("api request failed", { error: message });
    const status = (
      error instanceof Error &&
      "code" in error &&
      error.code === ambassadorPayoutRiskReviewRequiredCode
    ) ? 409 : error instanceof ApiRequestBodyError ? 400 : 400;
    return Response.json(safeErrorPayload(error), { status });
  }
};

if (process.env.NODE_ENV !== "test") {
  validateApiEnvironment();

  const server = createServer(async (req, res) => {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readIncomingMessage(req);
    const request = new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body,
    });

    const response = await handleRequest(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(await response.text());
  });

  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

export { handleRequest, setAmbassadorCaptureHandlerForTests, setApiAuthVerifierForTests, setLinkedWalletLookupForTests };
