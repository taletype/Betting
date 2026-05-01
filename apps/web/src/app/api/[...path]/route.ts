import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createDatabaseClient } from "@bet/db";
import { getPolymarketBuilderCode } from "@bet/integrations";
import { createSupabaseAdminClient } from "@bet/supabase/admin";
import { createSupabaseServerClient } from "@bet/supabase/server";
import { normalizeApiPayload } from "../_shared/api-serialization";
import { adminPolymarketStatusResponse } from "../_shared/admin-polymarket-status";
import { readExternalMarkets } from "../_shared/external-market-read";
import { isPolymarketRoutedTradingAllowlisted } from "../_shared/launch-status";
import {
  externalMarketDetailResponse,
  externalMarketHistoryResponse,
  externalMarketOrderbookResponse,
  externalMarketsResponse,
  externalMarketStatsResponse,
  externalMarketTradesResponse,
} from "../_shared/public-external-market-routes";
import { previewPolymarketOrder } from "../_shared/polymarket-orders";
import type { ExternalMarketApiRecord } from "../../../lib/api";
import {
  assertPolymarketL2CredentialSignature,
  assertWalletLinkSignature,
  buildPolymarketL2CredentialChallenge,
  buildWalletLinkChallenge,
  getWalletLinkDomain,
  hashWalletLinkNonce,
  normalizeWalletAddress,
  walletLinkChain,
} from "../_shared/wallet-link-challenge";
import {
  approveRewardPayoutDb,
  ambassadorPayoutRiskReviewRequiredCode,
  ambassadorPayoutRiskReviewRequiredMessage,
  captureAmbassadorReferralDb,
  cancelRewardPayoutDb,
  createAdminAmbassadorCodeDb,
  disableAdminAmbassadorCodeDb,
  failRewardPayoutDb,
  markRewardPayoutPaidDb,
  markRewardsPayableDb,
  readAdminAmbassadorOverviewDb,
  readAmbassadorDashboardDb,
  recordAdminMockBuilderTradeAttributionDb,
  requestAmbassadorPayoutDb,
  overrideAdminReferralAttributionDb,
  voidRewardsForTradeAttributionDb,
} from "../_shared/ambassador";
import { updateAdminRiskFlagReviewState } from "../../admin/risk-flags";

import {
  evaluateAdminAccess,
  evaluateAdminPermission,
  getAuthenticatedUser,
  type AdminPermission,
} from "../auth";

let supabaseAdminClientFactory = createSupabaseAdminClient;

export const setSupabaseAdminClientFactoryForTests = (
  factory: typeof createSupabaseAdminClient | null,
): void => {
  supabaseAdminClientFactory = factory ?? createSupabaseAdminClient;
};

const getVersionPayload = () => ({
  gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  vercelEnv: process.env.VERCEL_ENV ?? null,
  checkedAt: new Date().toISOString(),
});

const safeErrorMessage = (error: unknown): string =>
  process.env.NODE_ENV === "production" ? "Request failed" : error instanceof Error ? error.message : "Failed to fetch data";

const privateNoStoreHeaders = { "cache-control": "private, no-store" };

type DashboardFailureCode =
  | "dashboard_auth_missing"
  | "dashboard_db_unavailable"
  | "ambassador_tables_missing"
  | "ambassador_code_create_failed"
  | "profile_write_failed"
  | "service_api_unreachable"
  | "service_api_401"
  | "service_api_500";

const logDevelopmentDiagnostic = (message: string, metadata?: Record<string, unknown>): void => {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") return;
  console.warn(message, metadata ?? {});
};

const isDashboardPath = (apiPath: string): boolean =>
  apiPath === "ambassador/dashboard" || apiPath === "ambassador/summary" || apiPath === "referrals/me";

const dashboardFailureResponse = (
  code: DashboardFailureCode,
  status: number,
  source: "same-site API" | "service API",
  message = "Ambassador dashboard is unavailable",
) => {
  logDevelopmentDiagnostic(code, { status, source });
  return NextResponse.json({ error: message, code, source }, { status, headers: privateNoStoreHeaders });
};

const classifyDashboardDbError = (error: unknown): DashboardFailureCode => {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const pgCode = typeof record.code === "string" ? record.code : "";
  const message = error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "";

  if (pgCode === "42P01" || /relation .* does not exist|ambassador_codes|referral_attributions|ambassador_reward_ledger|ambassador_reward_payouts/i.test(message)) {
    return "ambassador_tables_missing";
  }
  if (
    (pgCode === "23503" && /profiles|owner_user_id|recipient_user_id|referred_user_id|referrer_user_id/i.test(message)) ||
    /insert into public\.profiles|profiles.*(permission|violates|failed|denied)|failed to.*profile/i.test(message)
  ) {
    return "profile_write_failed";
  }
  if (/failed to (create|generate) ambassador code|ambassador code/i.test(message)) {
    return "ambassador_code_create_failed";
  }
  return "dashboard_db_unavailable";
};

const rateLimitState = new Map<string, { windowStartedAtMs: number; count: number }>();

const checkLocalRateLimit = (
  scope: "publicMarkets" | "ambassadorReferral" | "ambassadorPayout",
  identity: string,
  maxRequests: number,
) => {
  const windowMs = 60_000;
  const key = `${scope}:${identity}`;
  const now = Date.now();
  const existing = rateLimitState.get(key);

  if (!existing || now - existing.windowStartedAtMs >= windowMs) {
    rateLimitState.set(key, { windowStartedAtMs: now, count: 1 });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(Math.ceil((windowMs - (now - existing.windowStartedAtMs)) / 1000), 1),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    retryAfterSeconds: Math.max(Math.ceil((windowMs - (now - existing.windowStartedAtMs)) / 1000), 1),
  };
};

const rateLimitResponse = (retryAfterSeconds: number) =>
  NextResponse.json({ error: "rate limit exceeded" }, { status: 429, headers: { "retry-after": String(retryAfterSeconds) } });

const recordAdminAuditLog = async (input: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  note?: string | null;
}) => {
  await createDatabaseClient().query(
    `
      insert into public.admin_audit_log (
        actor_user_id,
        actor_admin_user_id,
        action,
        entity_type,
        target_type,
        entity_id,
        target_id,
        before_status,
        after_status,
        note,
        metadata,
        created_at
      )
      values ($1::uuid, $1::uuid, $2, $3, $3, $4, $4, $5, $6, $7, $8::jsonb, now())
    `,
    [
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.beforeStatus ?? (typeof input.metadata?.beforeStatus === "string" ? input.metadata.beforeStatus : null),
      input.afterStatus ?? (typeof input.metadata?.afterStatus === "string" ? input.metadata.afterStatus : null),
      input.note ?? (typeof input.metadata?.notes === "string" ? input.metadata.notes : null),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
};

const readPayoutStatusForAudit = async (payoutId: string): Promise<string | null> => {
  const [row] = await createDatabaseClient().query<{ status: string }>(
    `select status from public.ambassador_reward_payouts where id = $1::uuid limit 1`,
    [payoutId],
  );
  return row?.status ?? null;
};

const requiredAmbassadorHealthEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const requiredAmbassadorHealthTables = [
  "public.profiles",
  "public.ambassador_codes",
  "public.referral_attributions",
  "public.builder_trade_attributions",
  "public.ambassador_reward_ledger",
  "public.ambassador_reward_payouts",
  "public.linked_wallets",
  "public.wallet_link_challenges",
] as const;

const readAmbassadorDashboardHealth = async (userId: string) => {
  const db = createDatabaseClient();
  const missingEnv = [
    ...requiredAmbassadorHealthEnv.filter((name) => !process.env[name]?.trim()),
    ...(!process.env.DATABASE_URL?.trim() && !process.env.SUPABASE_DB_URL?.trim() ? ["DATABASE_URL or SUPABASE_DB_URL"] : []),
  ];
  const tableRows = await db.query<{ table_name: string; exists: boolean }>(
    `
      select table_name, to_regclass(table_name) is not null as exists
      from unnest($1::text[]) as table_name
    `,
    [[...requiredAmbassadorHealthTables]],
  );
  const missingTables = tableRows.filter((row) => !row.exists).map((row) => row.table_name);

  let dashboardPath: { ok: boolean; code: DashboardFailureCode | null } = { ok: false, code: null };
  if (missingTables.length === 0) {
    try {
      const dashboard = await readAmbassadorDashboardDb(userId);
      dashboardPath = {
        ok: Boolean(dashboard.ambassadorCode?.code && dashboard.rewards && Array.isArray(dashboard.rewardLedger)),
        code: null,
      };
    } catch (error) {
      dashboardPath = { ok: false, code: classifyDashboardDbError(error) };
    }
  } else {
    dashboardPath = { ok: false, code: "ambassador_tables_missing" };
  }

  return {
    ok: missingEnv.length === 0 && missingTables.length === 0 && dashboardPath.ok,
    checkedAt: new Date().toISOString(),
    env: {
      missing: missingEnv,
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim()),
    },
    tables: {
      required: [...requiredAmbassadorHealthTables],
      missing: missingTables,
      migrations: [
        "supabase/migrations/0002_auth_profiles.sql",
        "supabase/migrations/0021_ambassador_rewards.sql",
        "supabase/migrations/0025_wallet_link_challenges.sql",
        "supabase/migrations/0031_reward_ledger_accounting_statuses.sql",
        "supabase/migrations/0034_reward_payout_reservations.sql",
        "supabase/migrations/0037_polymarket_builder_fee_reconciliation.sql",
        "supabase/migrations/0038_attribution_to_payout_accounting_chain.sql",
      ],
    },
    profile: { currentUserWritePath: missingTables.includes("public.profiles") ? "skipped" : dashboardPath.ok ? "ok" : "failed" },
    ambassadorCode: { createReadPath: dashboardPath },
    rewards: { emptySummaryPath: dashboardPath },
    code: missingTables.length > 0 ? "ambassador_tables_missing" : dashboardPath.code,
  };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const hashNullable = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? crypto.createHash("sha256").update(trimmed).digest("hex") : null;
};

const normalizeReferralCode = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9_-]{3,64}$/.test(normalized) ? normalized : null;
};

const requireAdminReasonField = (value: unknown, message: string): string => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(message);
  return normalized;
};

const captureReferralClickDb = async (input: {
  rawCode: string;
  landingPath: string;
  queryRef?: string | null;
  anonymousSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) => {
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const rawCode = input.rawCode.trim().slice(0, 128);
    const normalizedCode = normalizeReferralCode(rawCode);
    const [codeRecord] = normalizedCode
      ? await transaction.query<{ id: string; owner_user_id: string; status: "active" | "disabled" }>(
        `select id, owner_user_id, status from public.ambassador_codes where upper(code) = upper($1) limit 1`,
        [normalizedCode],
      )
      : [];
    const rejectReason = !normalizedCode
      ? "malformed_referral_code"
      : !codeRecord
        ? "invalid_referral_code"
        : codeRecord.status !== "active"
          ? "disabled_referral_code"
          : null;
    const status = rejectReason ? "rejected" : "captured";
    const sessionId = input.anonymousSessionId?.trim() || null;
    const [row] = await transaction.query<{ id: string; raw_code: string; status: string; reject_reason: string | null; anonymous_session_id: string | null }>(
      `
        insert into public.referral_clicks (
          referral_code_id, referrer_user_id, raw_code, landing_path, query_ref,
          anonymous_session_id, user_agent_hash, ip_hash, first_seen_at, last_seen_at,
          status, reject_reason, created_at
        ) values (
          $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, now(), now(), $9, $10, now()
        )
        on conflict (anonymous_session_id, (upper(raw_code)), landing_path)
        where anonymous_session_id is not null
        do update set last_seen_at = now(),
                      status = case when public.referral_clicks.status = 'applied' then 'applied' else excluded.status end,
                      reject_reason = excluded.reject_reason
        returning id, raw_code, status, reject_reason, anonymous_session_id
      `,
      [
        codeRecord?.id ?? null,
        codeRecord?.owner_user_id ?? null,
        rawCode,
        input.landingPath || "/",
        input.queryRef ?? normalizedCode,
        sessionId,
        hashNullable(input.userAgent),
        hashNullable(input.ipAddress),
        status,
        rejectReason,
      ],
    );
    if (!row) throw new Error("failed to capture referral click");
    if (sessionId && !rejectReason) {
      await transaction.query(
        `
          insert into public.referral_sessions (anonymous_session_id, first_referral_click_id, active_referral_click_id, status, first_seen_at, last_seen_at)
          values ($1, $2::uuid, $2::uuid, 'pending', now(), now())
          on conflict (anonymous_session_id) do update set last_seen_at = now()
        `,
        [sessionId, row.id],
      );
      await transaction.query(
        `
          insert into public.pending_referral_attributions (anonymous_session_id, referral_click_id, raw_code, normalized_code, landing_path, status, created_at, updated_at)
          values ($1, $2::uuid, $3, $4, $5, 'pending', now(), now())
          on conflict (anonymous_session_id)
          where status = 'pending'
          do update set updated_at = now()
        `,
        [sessionId, row.id, rawCode, normalizedCode, input.landingPath || "/"],
      );
    }
    await transaction.query(
      `
        insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
        values (null, $1, 'referral_attribution', $2, $3::jsonb, now())
      `,
      [
        rejectReason ? "ambassador.referral_rejected" : "ambassador.referral_captured",
        row.id,
        JSON.stringify({
          ambassadorCode: normalizedCode ?? rawCode,
          reason: rejectReason,
          sessionHash: hashNullable(sessionId),
          ipHash: hashNullable(input.ipAddress),
          userAgentHash: hashNullable(input.userAgent),
        }),
      ],
    );
    return {
      id: row.id,
      code: row.raw_code,
      status: row.status,
      rejectReason: row.reject_reason,
      anonymousSessionId: row.anonymous_session_id,
    };
  });
};

const adminPermissionDeniedResponse = (
  permission: AdminPermission,
  decision: ReturnType<typeof evaluateAdminPermission>,
) => NextResponse.json(
  {
    error: decision.error ?? "Admin privileges required",
    code: "ADMIN_PERMISSION_REQUIRED",
    permission,
  },
  { status: decision.status ?? 403 },
);

const requireAdminPermissionResponse = (
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>,
  permission: AdminPermission,
): NextResponse | null => {
  const decision = evaluateAdminPermission(user, permission);
  return decision.ok ? null : adminPermissionDeniedResponse(permission, decision);
};

const parsePayoutDualControlThreshold = (): bigint => {
  const rawValue = process.env.AMBASSADOR_PAYOUT_DUAL_CONTROL_THRESHOLD_USDC_ATOMS?.trim();
  if (!rawValue) return 0n;
  const parsed = BigInt(rawValue);
  if (parsed < 0n) throw new Error("AMBASSADOR_PAYOUT_DUAL_CONTROL_THRESHOLD_USDC_ATOMS must be non-negative");
  return parsed;
};

const assertPayoutPaidByDifferentActor = async (payoutId: string, actorUserId: string): Promise<void> => {
  const [payout] = await createDatabaseClient().query<{
    amount_usdc_atoms: bigint | number | string;
    reviewed_by: string | null;
    status: string;
  }>(
    `
      select amount_usdc_atoms, reviewed_by, status
        from public.ambassador_reward_payouts
       where id = $1::uuid
       limit 1
    `,
    [payoutId],
  );
  if (!payout) throw new Error("payout request not found");
  if (payout.status !== "approved") throw new Error("payout requires admin approval before it can be marked paid");
  if (BigInt(String(payout.amount_usdc_atoms)) >= parsePayoutDualControlThreshold() && payout.reviewed_by === actorUserId) {
    throw new Error("payout requires a different admin to mark paid after approval");
  }
};

const polymarketSubmitBlockedResponse = (status: 403 | 503, code: string, disabledReasons: string[]) =>
  NextResponse.json({ error: "Polymarket routed trading is disabled", code, disabledReasons }, { status });

const isInternalExchangeEnabled = (): boolean => process.env.INTERNAL_EXCHANGE_ENABLED === "true";
const getServiceApiBaseUrl = (): string | null => {
  const configured = process.env.API_BASE_URL;
  if (!configured) return null;
  return configured.replace(/\/$/, "");
};

const forwardServiceApiRequest = async (request: NextRequest, path: string): Promise<NextResponse | null> => {
  const baseUrl = getServiceApiBaseUrl();
  if (!baseUrl) return null;
  const headers = new Headers(request.headers);
  headers.delete("host");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${path}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
  } catch {
    if (isDashboardPath(path)) {
      return dashboardFailureResponse("service_api_unreachable", 503, "service API");
    }
    throw new Error("service API is unreachable");
  }
  const payload = await response.text();
  if (isDashboardPath(path) && response.status === 401) {
    logDevelopmentDiagnostic("service_api_401", { status: response.status, source: "service API" });
  }
  if (isDashboardPath(path) && response.status >= 500) {
    logDevelopmentDiagnostic("service_api_500", { status: response.status, source: "service API" });
  }
  return new NextResponse(payload, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
};

const isInternalExchangeApiPath = (apiPath: string): boolean =>
  apiPath === "markets" ||
  apiPath.startsWith("markets/") ||
  apiPath === "orders" ||
  /^orders\/[^/]+$/.test(apiPath) ||
  apiPath === "portfolio" ||
  apiPath === "claims" ||
  /^claims\/[^/]+(?:\/state)?$/.test(apiPath) ||
  apiPath === "deposits" ||
  apiPath === "deposits/verify" ||
  apiPath === "withdrawals";

const internalExchangeDisabledResponse = () =>
  NextResponse.json(
    {
      error: "internal exchange routes are disabled for production beta",
      code: "INTERNAL_EXCHANGE_DISABLED",
    },
    { status: 404 },
  );

async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const apiPath = path.join("/");

  try {
    if (apiPath === "health" && request.method === "GET") {
      return NextResponse.json({ ok: true, service: "api", checkedAt: new Date().toISOString() });
    }

    if (apiPath === "version" && request.method === "GET") {
      return NextResponse.json(getVersionPayload());
    }

    const adminSupabase = () => supabaseAdminClientFactory();

    if (apiPath === "external/markets" && request.method === "GET") {
      const rateLimit = checkLocalRateLimit("publicMarkets", request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "anonymous", 240);
      if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
      return externalMarketsResponse(request, adminSupabase);
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/orderbook$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      return externalMarketOrderbookResponse(source ?? "", externalId ?? "", adminSupabase);
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/trades$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      return externalMarketTradesResponse(source ?? "", externalId ?? "", adminSupabase);
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/history$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      return externalMarketHistoryResponse(source ?? "", externalId ?? "", adminSupabase);
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/stats$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      return externalMarketStatsResponse(source ?? "", externalId ?? "", adminSupabase);
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      return externalMarketDetailResponse(source ?? "", externalId ?? "", request, adminSupabase);
    }

    const user = await getAuthenticatedUser(request);
    const userId = user?.id ?? null;

    if (apiPath === "polymarket/orders/preview" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const markets = ((await readExternalMarkets(adminSupabase())) as ExternalMarketApiRecord[])
        .filter((market) => market.source === "polymarket");
      const preview = await previewPolymarketOrder(
        {
          ...body,
          loggedIn: Boolean(userId),
          walletConnected: body.walletConnected === true,
          l2CredentialsPresent: body.l2CredentialsPresent === true,
          userSigningAvailable: body.userSigningAvailable === true,
          submitterAvailable: process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true",
        },
        markets,
      );
      return NextResponse.json(preview);
    }

    if (apiPath === "polymarket/orders/preflight" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const markets = ((await readExternalMarkets(adminSupabase())) as ExternalMarketApiRecord[])
        .filter((market) => market.source === "polymarket");
      const globallyEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
      const betaEnabled = process.env.POLYMARKET_ROUTED_TRADING_BETA_ENABLED === "true";
      const betaAllowlisted = globallyEnabled || (betaEnabled && isPolymarketRoutedTradingAllowlisted({ userId }));
      const preview = await previewPolymarketOrder(
        {
          ...body,
          loggedIn: Boolean(userId),
          walletConnected: body.walletConnected === true,
          l2CredentialsPresent: body.l2CredentialsPresent === true,
          userSigningAvailable: body.userSigningAvailable === true,
          submitterAvailable: process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true",
        },
        markets,
      );
      const disabledReasons = [
        ...(globallyEnabled || betaEnabled ? [] : ["routed_trading_disabled"]),
        ...(betaAllowlisted ? [] : ["beta_user_not_allowlisted"]),
        ...preview.disabledReasonCodes,
      ];
      return NextResponse.json({
        ok: disabledReasons.length === 0,
        state: disabledReasons[0] ?? "ready_for_user_signature",
        disabledReasons,
        canaryOnly: !globallyEnabled,
        betaEnabled,
        betaUserAllowlisted: betaAllowlisted,
        routedTradingEnabled: globallyEnabled || betaEnabled,
        region: { status: "determined_by_polymarket" },
        preview,
      });
    }

    if (apiPath === "polymarket/orders/submit" && request.method === "POST") {
      if (!userId) {
        return NextResponse.json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
      }
      if (process.env.POLYMARKET_ROUTED_TRADING_KILL_SWITCH === "true" || process.env.POLYMARKET_ORDER_SUBMIT_KILL_SWITCH === "true") {
        return NextResponse.json({ error: "Polymarket routed trading is disabled", code: "POLYMARKET_ROUTED_TRADING_DISABLED" }, { status: 503 });
      }
      const globallyEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
      const betaEnabled = process.env.POLYMARKET_ROUTED_TRADING_BETA_ENABLED === "true";
      const betaUserAllowlisted = globallyEnabled || (betaEnabled && isPolymarketRoutedTradingAllowlisted({ userId }));
      if (!globallyEnabled && !betaEnabled) {
        return polymarketSubmitBlockedResponse(503, "POLYMARKET_ROUTED_TRADING_DISABLED", ["routed_trading_disabled"]);
      }
      if (!betaUserAllowlisted) {
        return polymarketSubmitBlockedResponse(403, "POLYMARKET_BETA_USER_NOT_ALLOWLISTED", ["beta_user_not_allowlisted"]);
      }
      if (!getPolymarketBuilderCode()) {
        return polymarketSubmitBlockedResponse(503, "POLYMARKET_BUILDER_CODE_MISSING", ["builder_code_missing"]);
      }
      if (process.env.POLYMARKET_CLOB_SUBMITTER !== "real" && process.env.POLYMARKET_SUBMITTER_AVAILABLE !== "true") {
        return polymarketSubmitBlockedResponse(503, "POLYMARKET_SUBMITTER_UNAVAILABLE", ["submitter_unavailable"]);
      }
      const [linkedWalletResult, l2CredentialsResult] = await Promise.all([
        adminSupabase()
          .from("linked_wallets")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle(),
        adminSupabase()
          .from("polymarket_l2_credentials")
          .select("status")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (linkedWalletResult.error) throw linkedWalletResult.error;
      if (l2CredentialsResult.error) throw l2CredentialsResult.error;
      if (!linkedWalletResult.data) {
        return polymarketSubmitBlockedResponse(403, "POLYMARKET_WALLET_NOT_LINKED", ["wallet_not_connected"]);
      }
      if (!l2CredentialsResult.data || l2CredentialsResult.data.status === "revoked") {
        return polymarketSubmitBlockedResponse(403, "POLYMARKET_L2_CREDENTIALS_MISSING", ["credentials_missing"]);
      }
      const forwarded = await forwardServiceApiRequest(request, "polymarket/orders/submit");
      if (forwarded) return forwarded;
      return NextResponse.json(
        { error: "Polymarket submitter unavailable", code: "POLYMARKET_SUBMITTER_UNAVAILABLE" },
        { status: 503 },
      );
    }

    if (apiPath === "referrals/click" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const payload = await captureReferralClickDb({
        rawCode: String(body.code ?? body.ref ?? body.rawCode ?? ""),
        landingPath: String(body.landingPath ?? "/"),
        queryRef: body.queryRef ? String(body.queryRef) : null,
        anonymousSessionId: body.anonymousSessionId ? String(body.anonymousSessionId) : body.sessionId ? String(body.sessionId) : null,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json(payload, { status: 202 });
    }

    if (!isInternalExchangeEnabled() && isInternalExchangeApiPath(apiPath)) {
      return internalExchangeDisabledResponse();
    }

    if (!userId) {
      if (isDashboardPath(apiPath)) {
        logDevelopmentDiagnostic("dashboard_auth_missing", {
          status: 401,
          source: "same-site API",
          hasCookieHeader: Boolean(request.headers.get("cookie")),
          hasBearerToken: Boolean(request.headers.get("authorization")?.startsWith("Bearer ")),
        });
      }
      return NextResponse.json({ error: "Authentication required", code: isDashboardPath(apiPath) ? "dashboard_auth_missing" : undefined }, { status: 401 });
    }

    const userSupabase = createSupabaseServerClient({
      get: (name) => request.cookies.get(name)?.value,
    });

    if ((apiPath === "internal/builder-route-events" || apiPath === "internal/builder-fee-confirmations") && request.method === "POST") {
      const adminAccess = evaluateAdminAccess(user);
      if (!adminAccess.ok) return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });
      const forwarded = await forwardServiceApiRequest(request, apiPath);
      if (forwarded) return forwarded;
      return NextResponse.json(
        { error: "Service API is required for internal Builder attribution ingestion", code: "SERVICE_API_REQUIRED" },
        { status: 503 },
      );
    }

    if ((apiPath === "wallets/linked" || apiPath === "wallets/me") && request.method === "GET") {
      const { data, error } = await adminSupabase()
        .from("linked_wallets")
        .select("id, chain, wallet_address, verified_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      const wallet = data
        ? {
            id: data.id,
            chain: data.chain,
            walletAddress: data.wallet_address,
            verifiedAt: data.verified_at,
          }
        : null;
      return NextResponse.json({
        wallets: wallet ? [wallet] : [],
        wallet: data
          ? wallet
          : null,
      });
    }

    if (apiPath === "polymarket/l2-credentials/status" && request.method === "GET") {
      const { data, error } = await adminSupabase()
        .from("polymarket_l2_credentials")
        .select("wallet_address, status, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json(data
        ? {
            status: data.status === "revoked" ? "revoked" : "present",
            walletAddress: data.wallet_address,
            updatedAt: data.updated_at,
          }
        : { status: "missing", walletAddress: null, updatedAt: null }, { headers: privateNoStoreHeaders });
    }

    if (apiPath === "polymarket/l2-credentials" && request.method === "DELETE") {
      const { error } = await adminSupabase()
        .from("polymarket_l2_credentials")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ status: "revoked", walletAddress: null, updatedAt: new Date().toISOString() }, { headers: privateNoStoreHeaders });
    }

    if (apiPath === "polymarket/l2-credentials/challenge" && request.method === "POST") {
      const forwarded = await forwardServiceApiRequest(request, "polymarket/l2-credentials/challenge");
      if (forwarded) return forwarded;
      const { data: wallet, error } = await adminSupabase()
        .from("linked_wallets")
        .select("wallet_address, verified_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!wallet?.wallet_address || !wallet.verified_at) {
        return NextResponse.json({ error: "verified linked wallet is required", code: "POLYMARKET_WALLET_NOT_VERIFIED" }, { status: 403, headers: privateNoStoreHeaders });
      }
      return NextResponse.json(
        buildPolymarketL2CredentialChallenge({
          userId,
          walletAddress: wallet.wallet_address,
          domain: getWalletLinkDomain(request.headers.get("host")),
        }),
        { status: 201, headers: privateNoStoreHeaders },
      );
    }

    if (apiPath === "polymarket/l2-credentials/derive" && request.method === "POST") {
      const forwarded = await forwardServiceApiRequest(request, "polymarket/l2-credentials/derive");
      if (forwarded) return forwarded;
      const { data: wallet, error } = await adminSupabase()
        .from("linked_wallets")
        .select("wallet_address, verified_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!wallet?.wallet_address || !wallet.verified_at) {
        return NextResponse.json({ error: "verified linked wallet is required", code: "POLYMARKET_WALLET_NOT_VERIFIED" }, { status: 403, headers: privateNoStoreHeaders });
      }
      const body = (await request.json().catch(() => ({}))) as { signedMessage?: string; signature?: string };
      try {
        assertPolymarketL2CredentialSignature({
          userId,
          walletAddress: wallet.wallet_address,
          domain: getWalletLinkDomain(request.headers.get("host")),
          signedMessage: String(body.signedMessage ?? ""),
          signature: String(body.signature ?? ""),
        });
      } catch {
        return NextResponse.json({ error: "signature does not match verified wallet", code: "POLYMARKET_WALLET_SIGNATURE_MISMATCH" }, { status: 400, headers: privateNoStoreHeaders });
      }
      return NextResponse.json(
        { error: "Polymarket L2 credential derivation is not enabled", code: "POLYMARKET_L2_SETUP_UNAVAILABLE" },
        { status: 503, headers: privateNoStoreHeaders },
      );
    }

    if (apiPath === "polymarket/l2-credentials" && request.method === "POST") {
      if (process.env.NEXT_PUBLIC_POLYMARKET_MANUAL_L2_CREDENTIALS_DEBUG !== "true" && process.env.POLYMARKET_MANUAL_L2_CREDENTIALS_DEBUG !== "true") {
        return NextResponse.json(
          { error: "manual Polymarket L2 credential input is disabled", code: "POLYMARKET_MANUAL_L2_CREDENTIALS_DISABLED" },
          { status: 404, headers: privateNoStoreHeaders },
        );
      }
      const forwarded = await forwardServiceApiRequest(request, "polymarket/l2-credentials");
      if (forwarded) return forwarded;
      return NextResponse.json(
        { error: "Polymarket L2 credential setup requires the service API", code: "POLYMARKET_L2_SETUP_UNAVAILABLE" },
        { status: 503 },
      );
    }

    if (apiPath === "wallets/link/challenge" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { walletAddress?: string; chain?: string };
      const { challenge, signedMessage, nonceHash } = buildWalletLinkChallenge({
        userId,
        walletAddress: body.walletAddress ?? "",
        chain: body.chain ?? walletLinkChain,
        domain: getWalletLinkDomain(request.headers.get("host")),
      });
      const [row] = await createDatabaseClient().query<{ id: string }>(
        `
          insert into public.wallet_link_challenges (
            user_id, wallet_address, chain, nonce_hash, domain, issued_at, expires_at, consumed_at, created_at
          ) values ($1::uuid, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, null, now())
          returning id
        `,
        [userId, challenge.walletAddress, challenge.chain, nonceHash, challenge.domain, challenge.issuedAt, challenge.expiresAt],
      );
      if (!row) throw new Error("failed to create wallet link challenge");
      return NextResponse.json({ challenge: { ...challenge, id: row.id }, signedMessage }, { status: 201 });
    }

    if ((apiPath === "wallets/link" || apiPath === "wallets/bind" || apiPath === "wallets/verify") && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        walletAddress?: string;
        chain?: string;
        challengeId?: string;
        signedMessage?: string;
        signature?: string;
      };

      const walletAddress = normalizeWalletAddress(body.walletAddress ?? "");
      const signedMessage = String(body.signedMessage ?? "");
      const signature = String(body.signature ?? "");
      let challenge: ReturnType<typeof assertWalletLinkSignature>;
      try {
        challenge = assertWalletLinkSignature({
          userId,
          walletAddress,
          chain: body.chain ?? walletLinkChain,
          domain: getWalletLinkDomain(request.headers.get("host")),
          signedMessage,
          signature,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const code = /expired/i.test(message) ? "challenge_expired" : "signature_mismatch";
        return NextResponse.json({ error: "wallet verification failed", code }, { status: 400, headers: privateNoStoreHeaders });
      }

      const data = await createDatabaseClient().transaction(async (transaction) => {
        const [consumed] = await transaction.query<{ id: string }>(
          `
            update public.wallet_link_challenges
               set consumed_at = now()
             where id = $1::uuid
               and user_id = $2::uuid
               and wallet_address = $3
               and chain = $4
               and domain = $5
               and nonce_hash = $6
               and consumed_at is null
               and expires_at > now()
            returning id
          `,
          [
            body.challengeId ?? "",
            userId,
            walletAddress,
            challenge.chain,
            challenge.domain,
            hashWalletLinkNonce(challenge.nonce),
          ],
        );
        if (!consumed) {
          throw new Error("challenge_reused");
        }
        const [linked] = await transaction.query<{
          id: string;
          chain: string;
          wallet_address: string;
          verified_at: Date | string;
        }>(
          `
            insert into public.linked_wallets (
              user_id, chain, wallet_address, signature, signed_message, verified_at, metadata, created_at, updated_at
            ) values ($1::uuid, 'base', $2, $3, $4, now(), '{}'::jsonb, now(), now())
            on conflict (user_id)
            do update set wallet_address = excluded.wallet_address,
                          signature = excluded.signature,
                          signed_message = excluded.signed_message,
                          verified_at = excluded.verified_at,
                          updated_at = excluded.updated_at
            returning id, chain, wallet_address, verified_at
          `,
          [userId, walletAddress, signature, signedMessage],
        );
        if (!linked) throw new Error("failed to link wallet");
        await transaction.query(
          `
            insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
            values
              ($1::uuid, 'wallet_bound', 'linked_wallet', $2, $3::jsonb, now()),
              ($1::uuid, 'wallet_verified', 'linked_wallet', $2, $3::jsonb, now())
          `,
          [userId, linked.id, JSON.stringify({ chain: linked.chain, walletAddress: linked.wallet_address })],
        );
        return linked;
      }).catch((error) => {
        if (error instanceof Error && error.message === "challenge_reused") return null;
        throw error;
      });
      if (!data) {
        return NextResponse.json({ error: "wallet verification failed", code: "challenge_reused" }, { status: 409, headers: privateNoStoreHeaders });
      }

      return NextResponse.json(
        {
          wallet: {
            id: data.id,
            chain: data.chain,
            walletAddress: data.wallet_address,
              verifiedAt: data.verified_at instanceof Date ? data.verified_at.toISOString() : new Date(data.verified_at).toISOString(),
          },
        },
        { status: 201 },
      );
    }

    if (apiPath.match(/^wallets\/[^/]+$/) && request.method === "DELETE") {
      const walletId = apiPath.split("/")[1] ?? "";
      await createDatabaseClient().transaction(async (transaction) => {
        await transaction.query(`delete from public.linked_wallets where id = $1::uuid and user_id = $2::uuid`, [walletId, userId]);
        await transaction.query(
          `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
           values ($1::uuid, 'wallet_unbound', 'linked_wallet', $2, '{}'::jsonb, now())`,
          [userId, walletId],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (apiPath === "portfolio" && request.method === "GET") {
      const { data, error } = await userSupabase.rpc("rpc_get_portfolio_snapshot", {
        p_user_id: userId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(normalizeApiPayload(data));
    }

    if (apiPath === "withdrawals" && request.method === "GET") {
      const { data, error } = await userSupabase.rpc("rpc_list_withdrawals", {
        p_user_id: userId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json({ withdrawals: data ?? [] });
    }

    if ((apiPath === "ambassador/dashboard" || apiPath === "ambassador/summary" || apiPath === "referrals/me") && request.method === "GET") {
      try {
        return NextResponse.json(normalizeApiPayload(await readAmbassadorDashboardDb(userId)), { headers: privateNoStoreHeaders });
      } catch (error) {
        const code = classifyDashboardDbError(error);
        return dashboardFailureResponse(code, 500, "same-site API", code === "ambassador_tables_missing"
          ? "Ambassador dashboard tables are missing. Apply the Supabase ambassador migrations."
          : "Ambassador dashboard is unavailable");
      }
    }

    if ((apiPath === "ambassador/capture" || apiPath === "referrals/apply") && request.method === "POST") {
      const rateLimit = checkLocalRateLimit("ambassadorReferral", userId, 20);
      if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
      const body = (await request.json().catch(() => ({}))) as { code?: string; idempotencyKey?: string; sessionId?: string };
      return NextResponse.json(normalizeApiPayload(await captureAmbassadorReferralDb(userId, body.code ?? "", {
        idempotencyKey: body.idempotencyKey ?? null,
        sessionId: body.sessionId ?? null,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      })));
    }

    if (apiPath === "ambassador/payouts" && request.method === "POST") {
      const rateLimit = checkLocalRateLimit("ambassadorPayout", userId, 10);
      if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
      const body = (await request.json().catch(() => ({}))) as {
        destinationType?: "wallet" | "manual";
        destinationValue?: string;
      };
      return NextResponse.json(
        normalizeApiPayload(
          await requestAmbassadorPayoutDb(userId, {
            destinationType: body.destinationType === "manual" ? "manual" : "wallet",
            destinationValue: body.destinationValue ?? "",
          }),
        ),
        { status: 201 },
      );
    }

    if ((apiPath === "rewards/summary" || apiPath === "rewards/ledger" || apiPath === "rewards/payout-requests") && request.method === "GET") {
      const dashboard = await readAmbassadorDashboardDb(userId);
      return NextResponse.json(normalizeApiPayload(
        apiPath.endsWith("/summary")
          ? { rewards: dashboard.rewards }
          : apiPath.endsWith("/ledger")
            ? { rewardLedger: dashboard.rewardLedger }
            : { payoutRequests: dashboard.payouts },
      ));
    }

    if (apiPath === "rewards/payout-requests" && request.method === "POST") {
      const rateLimit = checkLocalRateLimit("ambassadorPayout", userId, 10);
      if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
      const body = (await request.json().catch(() => ({}))) as {
        destinationType?: "wallet" | "manual";
        destinationValue?: string;
      };
      return NextResponse.json(
        normalizeApiPayload(
          await requestAmbassadorPayoutDb(userId, {
            destinationType: body.destinationType === "manual" ? "manual" : "wallet",
            destinationValue: body.destinationValue ?? "",
          }),
        ),
        { status: 201 },
      );
    }

    if (apiPath === "deposits/verify" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { txHash?: string };
      const { data, error } = await userSupabase.rpc("rpc_verify_deposit", {
        p_user_id: userId,
        p_tx_hash: body.txHash ?? "",
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data);
    }

    if (apiPath === "withdrawals" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        amountAtoms?: string;
        destinationAddress?: string;
      };
      const { data, error } = await userSupabase.rpc("rpc_request_withdrawal", {
        p_user_id: userId,
        p_amount_atoms: body.amountAtoms ?? "0",
        p_destination_address: body.destinationAddress ?? "",
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data, { status: 201 });
    }

    if (apiPath === "orders" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const { data, error } = await userSupabase.rpc("rpc_place_order", {
        p_user_id: userId,
        p_payload: body,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data, { status: 201 });
    }

    if (apiPath.match(/^orders\/[^/]+$/) && request.method === "DELETE") {
      const orderId = apiPath.split("/")[1] ?? "";
      const { data, error } = await userSupabase.rpc("rpc_cancel_order", {
        p_user_id: userId,
        p_order_id: orderId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data);
    }

    if (apiPath.match(/^claims\/[^/]+$/) && request.method === "POST") {
      const marketId = apiPath.split("/")[1] ?? "";
      const { data, error } = await userSupabase.rpc("rpc_claim_payout", {
        p_user_id: userId,
        p_market_id: marketId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data, { status: 201 });
    }

    if (apiPath.startsWith("admin/")) {
      const adminAccess = evaluateAdminAccess(user);
      if (!adminAccess.ok) {
        return NextResponse.json({ error: adminAccess.error }, { status: adminAccess.status });
      }

      const adminActorId = user!.id;

      if (apiPath === "admin/polymarket/status" && request.method === "GET") {
        const permissionError = requireAdminPermissionResponse(user, "polymarket:read");
        if (permissionError) return permissionError;
        return adminPolymarketStatusResponse(request, adminSupabase);
      }

      if (apiPath === "admin/ambassador-dashboard-health" && request.method === "GET") {
        const permissionError = requireAdminPermissionResponse(user, "admin:read");
        if (permissionError) return permissionError;
        return NextResponse.json(await readAmbassadorDashboardHealth(adminActorId), { headers: privateNoStoreHeaders });
      }

      if (apiPath === "admin/withdrawals" && request.method === "GET") {
        const permissionError = requireAdminPermissionResponse(user, "withdrawal:read");
        if (permissionError) return permissionError;
        const { data, error } = await adminSupabase().rpc("rpc_admin_list_requested_withdrawals");
        if (error) {
          throw error;
        }
        return NextResponse.json({ withdrawals: data ?? [] });
      }

      if (
        (
          apiPath === "admin/ambassador" ||
          apiPath === "admin/referrals" ||
          apiPath === "admin/rewards" ||
          apiPath === "admin/payouts" ||
          apiPath === "admin/polymarket/builder-attributions"
        ) &&
        request.method === "GET"
      ) {
        const permissionError = requireAdminPermissionResponse(user, "admin:read");
        if (permissionError) return permissionError;
        return NextResponse.json(normalizeApiPayload(await readAdminAmbassadorOverviewDb()));
      }

      if (apiPath === "admin/payouts/export.csv" && request.method === "GET") {
        const permissionError = requireAdminPermissionResponse(user, "admin:read");
        if (permissionError) return permissionError;
        const overview = await readAdminAmbassadorOverviewDb();
        const csv = [
          "id,recipient_user_id,amount_usdc_atoms,status,payout_chain,payout_asset,destination_type,destination_value,tx_hash",
          ...overview.payouts.map((payout) => [
            payout.id,
            payout.recipientUserId,
            String(payout.amountUsdcAtoms),
            payout.status,
            payout.payoutChain,
            payout.payoutAsset,
            payout.destinationType,
            payout.destinationValue.replaceAll(",", " "),
            payout.txHash ?? "",
          ].join(",")),
        ].join("\n");
        return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8" } });
      }

      if (apiPath === "admin/ambassador/codes" && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "ambassador_code:manage");
        if (permissionError) return permissionError;
        const body = (await request.json().catch(() => ({}))) as { ownerUserId?: string; code?: string | null };
        const result = normalizeApiPayload(await createAdminAmbassadorCodeDb({
            ownerUserId: String(body.ownerUserId ?? ""),
            code: body.code ? String(body.code) : null,
          }));
        const resultRecord = asRecord(result);
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "ambassador_code.create", entityType: "ambassador_code", entityId: String(resultRecord.id ?? ""), metadata: { ownerUserId: body.ownerUserId ?? null } });
        return NextResponse.json(result, { status: 201 });
      }

      if (apiPath.match(/^admin\/ambassador\/codes\/[^/]+\/disable$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "ambassador_code:manage");
        if (permissionError) return permissionError;
        const codeId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { reason?: string };
        const reason = requireAdminReasonField(body.reason, "admin disable reason is required");
        const result = normalizeApiPayload(await disableAdminAmbassadorCodeDb(codeId));
        await recordAdminAuditLog({
          actorUserId: adminActorId,
          action: "ambassador_code.disable",
          entityType: "ambassador_code",
          entityId: codeId,
          metadata: { reason },
        });
        return NextResponse.json(result);
      }

      if (apiPath === "admin/ambassador/referral-attributions/override" && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "referral_attribution:override");
        if (permissionError) return permissionError;
        const body = (await request.json().catch(() => ({}))) as {
          referredUserId?: string;
          ambassadorCode?: string;
          code?: string;
          reason?: string;
        };
        const result = normalizeApiPayload(
            await overrideAdminReferralAttributionDb({
              referredUserId: String(body.referredUserId ?? ""),
              ambassadorCode: String(body.ambassadorCode ?? body.code ?? ""),
              reason: String(body.reason ?? ""),
            }),
          );
        const resultRecord = asRecord(result);
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "referral_attribution.override", entityType: "referral_attribution", entityId: String(resultRecord.id ?? body.referredUserId ?? ""), metadata: { reason: body.reason ?? "" } });
        return NextResponse.json(result);
      }

      if (apiPath === "admin/ambassador/trade-attributions/mock" && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "builder_trade_attribution:record");
        if (permissionError) return permissionError;
        const body = (await request.json().catch(() => ({}))) as {
          userId?: string;
          polymarketOrderId?: string | null;
          polymarketTradeId?: string | null;
          conditionId?: string | null;
          marketSlug?: string | null;
          notionalUsdcAtoms?: string;
          builderFeeUsdcAtoms?: string;
          status?: "pending" | "confirmed" | "void";
        };
        const result = normalizeApiPayload(
            await recordAdminMockBuilderTradeAttributionDb({
              userId: String(body.userId ?? ""),
              polymarketOrderId: body.polymarketOrderId ? String(body.polymarketOrderId) : null,
              polymarketTradeId: body.polymarketTradeId ? String(body.polymarketTradeId) : null,
              conditionId: body.conditionId ? String(body.conditionId) : null,
              marketSlug: body.marketSlug ? String(body.marketSlug) : null,
              notionalUsdcAtoms: BigInt(String(body.notionalUsdcAtoms ?? "0")),
              builderFeeUsdcAtoms: BigInt(String(body.builderFeeUsdcAtoms ?? "0")),
              status: body.status === "void" || body.status === "confirmed" ? body.status : "pending",
            }),
          );
        const resultRecord = asRecord(result);
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "builder_trade_attribution.record_unconfirmed_placeholder", entityType: "builder_trade_attribution", entityId: String(resultRecord.tradeAttributionId ?? ""), metadata: { requestedStatus: body.status ?? "pending" } });
        return NextResponse.json(result, { status: 201 });
      }

      if (apiPath.match(/^admin\/ambassador\/trade-attributions\/[^/]+\/payable$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "reward_ledger:review");
        if (permissionError) return permissionError;
        const tradeAttributionId = apiPath.split("/")[3] ?? "";
        const result = await markRewardsPayableDb(tradeAttributionId);
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "reward_ledger.mark_payable", entityType: "builder_trade_attribution", entityId: tradeAttributionId });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/trade-attributions\/[^/]+\/void$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "reward_ledger:review");
        if (permissionError) return permissionError;
        const tradeAttributionId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { reason?: string };
        const reason = requireAdminReasonField(body.reason, "void reason is required");
        const result = await voidRewardsForTradeAttributionDb(tradeAttributionId, reason);
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "reward_ledger.void", entityType: "builder_trade_attribution", entityId: tradeAttributionId, metadata: { reason } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/risk-flags\/[^/]+\/review$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "risk_flag:review");
        if (permissionError) return permissionError;
        const riskFlagId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { reviewNotes?: string };
        const reviewNotes = requireAdminReasonField(body.reviewNotes, "risk review notes are required");
        const result = await updateAdminRiskFlagReviewState({
          riskFlagId,
          reviewedBy: adminActorId,
          status: "reviewed",
          reviewNotes,
        });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/risk-flags\/[^/]+\/dismiss$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "risk_flag:dismiss");
        if (permissionError) return permissionError;
        const riskFlagId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { reviewNotes?: string };
        const reviewNotes = requireAdminReasonField(body.reviewNotes, "risk review notes are required");
        const result = await updateAdminRiskFlagReviewState({
          riskFlagId,
          reviewedBy: adminActorId,
          status: "dismissed",
          reviewNotes,
        });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/risk-flags\/[^/]+\/(review|dismiss)$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "admin:read");
        if (permissionError) return permissionError;
        const parts = apiPath.split("/");
        const riskFlagId = parts[3] ?? "";
        const action = parts[4] === "dismiss" ? "dismissed" : "reviewed";
        const body = (await request.json().catch(() => ({}))) as { reviewNotes?: string; notes?: string };
        const note = requireAdminReasonField(body.reviewNotes ?? body.notes, "risk review note is required");
        await createDatabaseClient().transaction(async (transaction) => {
          await transaction.query(
            `
              update public.ambassador_risk_flags
                 set status = $3,
                     reviewed_by = $2::uuid,
                     reviewed_at = now(),
                     review_notes = $4
               where id = $1::uuid
                 and status = 'open'
            `,
            [riskFlagId, adminActorId, action, note],
          );
          await transaction.query(
            `
              insert into public.admin_audit_log (
                actor_user_id, actor_admin_user_id, action, entity_type, target_type, entity_id, target_id,
                before_status, after_status, note, metadata, created_at
              ) values ($1::uuid, $1::uuid, $2, 'ambassador_risk_flag', 'ambassador_risk_flag', $3, $3, 'open', $4, $5, '{}'::jsonb, now())
            `,
            [adminActorId, action === "dismissed" ? "risk_flag.dismiss" : "risk_flag.review", riskFlagId, action, note],
          );
        });
        return NextResponse.json({ ok: true });
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/approve$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:approve");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const result = await approveRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: body.notes ?? null });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.approve", entityType: "payout_request", entityId: payoutId, beforeStatus: "requested", afterStatus: result.status, metadata: { beforeStatus: "requested", afterStatus: result.status, notes: body.notes ?? null } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/payouts\/[^/]+\/approve$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:approve");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[2] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const result = await approveRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: body.notes ?? null });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.approve", entityType: "payout_request", entityId: payoutId, beforeStatus: "requested", afterStatus: result.status, metadata: { beforeStatus: "requested", afterStatus: result.status, notes: body.notes ?? null } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/paid$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:mark_paid");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { txHash?: string; notes?: string };
        await assertPayoutPaidByDifferentActor(payoutId, adminActorId);
        const result = await markRewardPayoutPaidDb({ payoutId, reviewedBy: adminActorId, txHash: body.txHash ?? null, notes: body.notes ?? null });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.mark_paid", entityType: "payout_request", entityId: payoutId, beforeStatus: "approved", afterStatus: result.status, metadata: { beforeStatus: "approved", afterStatus: result.status, txHash: body.txHash ?? null } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/payouts\/[^/]+\/mark-paid$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:mark_paid");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[2] ?? "";
        const body = (await request.json().catch(() => ({}))) as { txHash?: string; notes?: string };
        await assertPayoutPaidByDifferentActor(payoutId, adminActorId);
        const result = await markRewardPayoutPaidDb({ payoutId, reviewedBy: adminActorId, txHash: body.txHash ?? null, notes: body.notes ?? null });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.mark_paid", entityType: "payout_request", entityId: payoutId, beforeStatus: "approved", afterStatus: result.status, metadata: { beforeStatus: "approved", afterStatus: result.status, txHash: body.txHash ?? null } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/failed$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:close");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const notes = requireAdminReasonField(body.notes, "payout failure reason is required");
        const beforeStatus = await readPayoutStatusForAudit(payoutId);
        const result = await failRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.mark_failed", entityType: "payout_request", entityId: payoutId, beforeStatus, afterStatus: result.status, note: notes, metadata: { beforeStatus, afterStatus: result.status, notes } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/payouts\/[^/]+\/mark-failed$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:close");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[2] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const notes = requireAdminReasonField(body.notes, "payout failure reason is required");
        const beforeStatus = await readPayoutStatusForAudit(payoutId);
        const result = await failRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.mark_failed", entityType: "payout_request", entityId: payoutId, beforeStatus, afterStatus: result.status, note: notes, metadata: { beforeStatus, afterStatus: result.status, notes } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/cancelled$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:close");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const notes = requireAdminReasonField(body.notes, "payout cancellation reason is required");
        const beforeStatus = await readPayoutStatusForAudit(payoutId);
        const result = await cancelRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.cancel", entityType: "payout_request", entityId: payoutId, beforeStatus, afterStatus: result.status, note: notes, metadata: { beforeStatus, afterStatus: result.status, notes } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/payouts\/[^/]+\/cancel$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:close");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[2] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const notes = requireAdminReasonField(body.notes, "payout cancellation reason is required");
        const beforeStatus = await readPayoutStatusForAudit(payoutId);
        const result = await cancelRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.cancel", entityType: "payout_request", entityId: payoutId, beforeStatus, afterStatus: result.status, note: notes, metadata: { beforeStatus, afterStatus: result.status, notes } });
        return NextResponse.json(result);
      }

    }

    return NextResponse.json({ error: "Endpoint not implemented" }, { status: 404 });
  } catch (error) {
    if (isDashboardPath(apiPath)) {
      const code = classifyDashboardDbError(error);
      return dashboardFailureResponse(code, 500, "same-site API", code === "ambassador_tables_missing"
        ? "Ambassador dashboard tables are missing. Apply the Supabase ambassador migrations."
        : "Ambassador dashboard is unavailable");
    }
    console.error(`Error handling /${apiPath}:`, error);
    const message = error instanceof Error ? error.message : "Failed to fetch data";
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === ambassadorPayoutRiskReviewRequiredCode
    ) {
      // Safe operator-facing copy: high-severity risk review is required before payout approval.
      return NextResponse.json(
        {
          error: ambassadorPayoutRiskReviewRequiredMessage,
          code: ambassadorPayoutRiskReviewRequiredCode,
          message: ambassadorPayoutRiskReviewRequiredMessage,
        },
        { status: 409 },
      );
    }
    if (/SUPABASE_/.test(message)) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing or invalid", code: "SUPABASE_ENV_MISSING" },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: safeErrorMessage(error), code: "API_REQUEST_FAILED" }, { status: 500 });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const PATCH = handleRequest;
