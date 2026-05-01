import { NextRequest, NextResponse } from "next/server";
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
  assertWalletLinkSignature,
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
}) => {
  await createDatabaseClient().query(
    `
      insert into public.admin_audit_log (actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values ($1::uuid, $2, $3, $4, $5::jsonb, now())
    `,
    [input.actorUserId, input.action, input.entityType, input.entityId, JSON.stringify(input.metadata ?? {})],
  );
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

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
  const response = await fetch(`${baseUrl}/${path}`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
  });
  const payload = await response.text();
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

    if (!isInternalExchangeEnabled() && isInternalExchangeApiPath(apiPath)) {
      return internalExchangeDisabledResponse();
    }

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const userSupabase = createSupabaseServerClient({
      get: (name) => request.cookies.get(name)?.value,
    });

    if (apiPath === "wallets/linked" && request.method === "GET") {
      const { data, error } = await adminSupabase()
        .from("linked_wallets")
        .select("id, chain, wallet_address, verified_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return NextResponse.json({
        wallet: data
          ? {
              id: data.id,
              chain: data.chain,
              walletAddress: data.wallet_address,
              verifiedAt: data.verified_at,
            }
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

    if (apiPath === "polymarket/l2-credentials" && request.method === "POST") {
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

    if (apiPath === "wallets/link" && request.method === "POST") {
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
      const challenge = assertWalletLinkSignature({
        userId,
        walletAddress,
        chain: body.chain ?? walletLinkChain,
        domain: getWalletLinkDomain(request.headers.get("host")),
        signedMessage,
        signature,
      });

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
        if (!consumed) throw new Error("wallet link challenge not found or already consumed");
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
        return linked;
      });

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

    if (apiPath === "ambassador/dashboard" && request.method === "GET") {
      return NextResponse.json(normalizeApiPayload(await readAmbassadorDashboardDb(userId)));
    }

    if (apiPath === "ambassador/capture" && request.method === "POST") {
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

      if (apiPath === "admin/withdrawals" && request.method === "GET") {
        const permissionError = requireAdminPermissionResponse(user, "withdrawal:read");
        if (permissionError) return permissionError;
        const { data, error } = await adminSupabase().rpc("rpc_admin_list_requested_withdrawals");
        if (error) {
          throw error;
        }
        return NextResponse.json({ withdrawals: data ?? [] });
      }

      if (apiPath === "admin/ambassador" && request.method === "GET") {
        const permissionError = requireAdminPermissionResponse(user, "admin:read");
        if (permissionError) return permissionError;
        return NextResponse.json(normalizeApiPayload(await readAdminAmbassadorOverviewDb()));
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
        const result = normalizeApiPayload(await disableAdminAmbassadorCodeDb(codeId));
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "ambassador_code.disable", entityType: "ambassador_code", entityId: codeId });
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
        const result = await voidRewardsForTradeAttributionDb(tradeAttributionId, String(body.reason ?? ""));
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "reward_ledger.void", entityType: "builder_trade_attribution", entityId: tradeAttributionId, metadata: { reason: body.reason ?? "" } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/approve$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:approve");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const result = await approveRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: body.notes ?? null });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.approve", entityType: "payout_request", entityId: payoutId, metadata: { notes: body.notes ?? null } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/paid$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:mark_paid");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { txHash?: string; notes?: string };
        await assertPayoutPaidByDifferentActor(payoutId, adminActorId);
        const result = await markRewardPayoutPaidDb({ payoutId, reviewedBy: adminActorId, txHash: body.txHash ?? null, notes: body.notes ?? null });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.mark_paid", entityType: "payout_request", entityId: payoutId, metadata: { txHash: body.txHash ?? null } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/failed$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:close");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const result = await failRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: String(body.notes ?? "") });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.mark_failed", entityType: "payout_request", entityId: payoutId, metadata: { notes: body.notes ?? "" } });
        return NextResponse.json(result);
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/cancelled$/) && request.method === "POST") {
        const permissionError = requireAdminPermissionResponse(user, "payout:close");
        if (permissionError) return permissionError;
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        const result = await cancelRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: String(body.notes ?? "") });
        await recordAdminAuditLog({ actorUserId: adminActorId, action: "payout.cancel", entityType: "payout_request", entityId: payoutId, metadata: { notes: body.notes ?? "" } });
        return NextResponse.json(result);
      }

    }

    return NextResponse.json({ error: "Endpoint not implemented" }, { status: 404 });
  } catch (error) {
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
