import { NextRequest, NextResponse } from "next/server";
import { createDatabaseClient } from "@bet/db";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@bet/supabase";
import { normalizeApiPayload } from "../_shared/api-serialization";
import { adminPolymarketStatusResponse } from "../_shared/admin-polymarket-status";
import { readExternalMarkets } from "../_shared/external-market-read";
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
  getAuthenticatedUser,
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
          geoblockAllowed: body.geoblockAllowed === true,
          l2CredentialsPresent: body.l2CredentialsPresent === true,
          userSigningAvailable: body.userSigningAvailable === true,
          submitterAvailable: process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true",
        },
        markets,
      );
      return NextResponse.json(preview);
    }

    if (apiPath === "polymarket/orders/preflight" && request.method === "POST") {
      if (!userId) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const markets = ((await readExternalMarkets(adminSupabase())) as ExternalMarketApiRecord[])
        .filter((market) => market.source === "polymarket");
      const country = (request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "").toUpperCase();
      const restricted = new Set((process.env.POLYMARKET_RESTRICTED_COUNTRIES ?? "US").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean));
      const regionState = !country ? "region_unknown" : restricted.has(country) ? "region_blocked" : null;
      const preview = await previewPolymarketOrder(
        {
          ...body,
          loggedIn: Boolean(userId),
          walletConnected: body.walletConnected === true,
          geoblockAllowed: regionState === null ? true : regionState === "region_blocked" ? false : undefined,
          l2CredentialsPresent: body.l2CredentialsPresent === true,
          userSigningAvailable: body.userSigningAvailable === true,
          submitterAvailable: process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true",
        },
        markets,
      );
      const disabledReasons = [
        ...(process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true" ? [] : ["routed_trading_disabled"]),
        ...(process.env.POLYMARKET_ROUTED_TRADING_CANARY_ONLY !== "false" ? ["canary_not_allowed"] : []),
        ...(regionState ? [regionState] : []),
        ...preview.disabledReasonCodes,
      ];
      return NextResponse.json({
        ok: disabledReasons.length === 0,
        state: disabledReasons[0] ?? "ready_for_user_signature",
        disabledReasons,
        canaryOnly: process.env.POLYMARKET_ROUTED_TRADING_CANARY_ONLY !== "false",
        routedTradingEnabled: process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true",
        region: { status: regionState === null ? "allowed" : regionState === "region_blocked" ? "blocked" : "unknown", country: country || null },
        preview,
      });
    }

    if (apiPath === "polymarket/orders/submit" && request.method === "POST") {
      if (!userId) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      return NextResponse.json(
        {
          error: "Polymarket signed order submission is handled by the service API canary path and is disabled here by default",
          code: "POLYMARKET_SUBMITTER_UNAVAILABLE",
        },
        { status: 503 },
      );
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
      const body = (await request.json().catch(() => ({}))) as { code?: string };
      return NextResponse.json(normalizeApiPayload(await captureAmbassadorReferralDb(userId, body.code ?? "")));
    }

    if (apiPath === "ambassador/payouts" && request.method === "POST") {
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
        return adminPolymarketStatusResponse(request, adminSupabase);
      }

      if (apiPath === "admin/withdrawals" && request.method === "GET") {
        const { data, error } = await adminSupabase().rpc("rpc_admin_list_requested_withdrawals");
        if (error) {
          throw error;
        }
        return NextResponse.json({ withdrawals: data ?? [] });
      }

      if (apiPath === "admin/ambassador" && request.method === "GET") {
        void adminActorId;
        return NextResponse.json(normalizeApiPayload(await readAdminAmbassadorOverviewDb()));
      }

      if (apiPath === "admin/ambassador/codes" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { ownerUserId?: string; code?: string | null };
        return NextResponse.json(
          normalizeApiPayload(await createAdminAmbassadorCodeDb({
            ownerUserId: String(body.ownerUserId ?? ""),
            code: body.code ? String(body.code) : null,
          })),
          { status: 201 },
        );
      }

      if (apiPath.match(/^admin\/ambassador\/codes\/[^/]+\/disable$/) && request.method === "POST") {
        const codeId = apiPath.split("/")[3] ?? "";
        return NextResponse.json(normalizeApiPayload(await disableAdminAmbassadorCodeDb(codeId)));
      }

      if (apiPath === "admin/ambassador/referral-attributions/override" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as {
          referredUserId?: string;
          ambassadorCode?: string;
          code?: string;
          reason?: string;
        };
        return NextResponse.json(
          normalizeApiPayload(
            await overrideAdminReferralAttributionDb({
              referredUserId: String(body.referredUserId ?? ""),
              ambassadorCode: String(body.ambassadorCode ?? body.code ?? ""),
              reason: String(body.reason ?? ""),
            }),
          ),
        );
      }

      if (apiPath === "admin/ambassador/trade-attributions/mock" && request.method === "POST") {
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
        return NextResponse.json(
          normalizeApiPayload(
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
          ),
          { status: 201 },
        );
      }

      if (apiPath.match(/^admin\/ambassador\/trade-attributions\/[^/]+\/payable$/) && request.method === "POST") {
        const tradeAttributionId = apiPath.split("/")[3] ?? "";
        return NextResponse.json(await markRewardsPayableDb(tradeAttributionId));
      }

      if (apiPath.match(/^admin\/ambassador\/trade-attributions\/[^/]+\/void$/) && request.method === "POST") {
        const tradeAttributionId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { reason?: string };
        return NextResponse.json(await voidRewardsForTradeAttributionDb(tradeAttributionId, String(body.reason ?? "")));
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/approve$/) && request.method === "POST") {
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        return NextResponse.json(await approveRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: body.notes ?? null }));
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/paid$/) && request.method === "POST") {
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { txHash?: string; notes?: string };
        return NextResponse.json(await markRewardPayoutPaidDb({ payoutId, reviewedBy: adminActorId, txHash: body.txHash ?? null, notes: body.notes ?? null }));
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/failed$/) && request.method === "POST") {
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        return NextResponse.json(await failRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: String(body.notes ?? "") }));
      }

      if (apiPath.match(/^admin\/ambassador\/payouts\/[^/]+\/cancelled$/) && request.method === "POST") {
        const payoutId = apiPath.split("/")[3] ?? "";
        const body = (await request.json().catch(() => ({}))) as { notes?: string };
        return NextResponse.json(await cancelRewardPayoutDb({ payoutId, reviewedBy: adminActorId, notes: String(body.notes ?? "") }));
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
