import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "ethers";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@bet/supabase";
import { readMarketById, readMarketOrderBook, readMarketTrades } from "../_shared/market-read";
import { normalizeApiPayload } from "../_shared/api-serialization";
import { getMarketsResponse } from "../_shared/market-route-response";
import { readExternalMarketBySourceAndId, readExternalMarkets } from "../_shared/external-market-read";
import { previewPolymarketOrder } from "../_shared/polymarket-orders";
import type { ExternalMarketApiRecord } from "../../../lib/api";
import {
  approveRewardPayoutDb,
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

const normalizeAddress = (value: string): string => value.trim().toLowerCase();

const getVersionPayload = () => ({
  gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  vercelEnv: process.env.VERCEL_ENV ?? null,
  checkedAt: new Date().toISOString(),
});

const assertWalletLinkMessage = (message: string, userId: string): void => {
  if (!message.includes("Bet wallet link")) {
    throw new Error("invalid signed message prefix");
  }

  if (!message.includes(`user:${userId}`) && !message.includes("user:self")) {
    throw new Error("signed message user mismatch");
  }
};

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

    const adminSupabase = supabaseAdminClientFactory();

    if (apiPath === "markets" && request.method === "GET") {
      return await getMarketsResponse();
    }

    if (apiPath.match(/^markets\/[^/]+$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";

      const market = await readMarketById(adminSupabase, marketId);
      if (!market) {
        return NextResponse.json({ market: null }, { status: 404 });
      }
      return NextResponse.json({ market });
    }

    if (apiPath.match(/^markets\/[^/]+\/orderbook$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";
      return NextResponse.json(await readMarketOrderBook(adminSupabase, marketId));
    }

    if (apiPath.match(/^markets\/[^/]+\/trades$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";
      return NextResponse.json(await readMarketTrades(adminSupabase, marketId));
    }

    if (apiPath === "external/markets" && request.method === "GET") {
      return NextResponse.json(await readExternalMarkets(adminSupabase));
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/orderbook$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      const market = await readExternalMarketBySourceAndId(adminSupabase, source ?? "", externalId ?? "");
      return NextResponse.json({ orderbook: market?.latestOrderbook ?? [], depth: [] });
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/trades$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      const market = await readExternalMarketBySourceAndId(adminSupabase, source ?? "", externalId ?? "");
      return NextResponse.json({ source, externalId, trades: market?.recentTrades ?? [] });
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/history$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      const market = await readExternalMarketBySourceAndId(adminSupabase, source ?? "", externalId ?? "");
      const history = (market?.recentTrades ?? []).map((trade) => ({
        timestamp: trade.tradedAt,
        outcome: trade.externalOutcomeId,
        price: trade.price,
        volume: trade.size,
        liquidity: null,
        source: market?.source ?? source,
        provenance: { source: market?.source ?? source, upstream: "external_trade_ticks" },
      })).reverse();
      return NextResponse.json({ source, externalId, history });
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+\/stats$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      const market = await readExternalMarketBySourceAndId(adminSupabase, source ?? "", externalId ?? "");
      const lastUpdatedAt = market?.lastUpdatedAt ?? market?.lastSyncedAt ?? null;
      return NextResponse.json({
        source,
        externalId,
        volume24h: market?.volume24h ?? null,
        liquidity: market?.liquidity ?? market?.volumeTotal ?? null,
        spread: market?.bestBid !== null && market?.bestAsk !== null && market?.bestBid !== undefined && market?.bestAsk !== undefined
          ? Math.max(0, market.bestAsk - market.bestBid)
          : null,
        closeTime: market?.closeTime ?? null,
        lastUpdatedAt,
        stale: lastUpdatedAt ? Date.now() - new Date(lastUpdatedAt).getTime() > 15 * 60 * 1000 : true,
      });
    }

    if (apiPath.match(/^external\/markets\/[^/]+\/[^/]+$/) && request.method === "GET") {
      const [, , source, externalId] = apiPath.split("/");
      const market = await readExternalMarketBySourceAndId(adminSupabase, source ?? "", externalId ?? "");
      return NextResponse.json({ market }, { status: market ? 200 : 404 });
    }

    const user = await getAuthenticatedUser(request);
    const userId = user?.id ?? null;

    if (apiPath === "polymarket/orders/preview" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const markets = ((await readExternalMarkets(adminSupabase)) as ExternalMarketApiRecord[])
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

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const userSupabase = createSupabaseServerClient({
      get: (name) => request.cookies.get(name)?.value,
    });

    if (apiPath === "wallets/linked" && request.method === "GET") {
      const { data, error } = await adminSupabase
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

    if (apiPath === "wallets/link" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        walletAddress?: string;
        signedMessage?: string;
        signature?: string;
      };

      const walletAddress = normalizeAddress(body.walletAddress ?? "");
      const signedMessage = String(body.signedMessage ?? "");
      const signature = String(body.signature ?? "");

      assertWalletLinkMessage(signedMessage, userId);

      const recoveredAddress = normalizeAddress(verifyMessage(signedMessage, signature));
      if (recoveredAddress !== walletAddress) {
        return NextResponse.json({ error: "signature does not match wallet address" }, { status: 400 });
      }

      const { data, error } = await adminSupabase
        .from("linked_wallets")
        .upsert(
          {
            user_id: userId,
            chain: "base",
            wallet_address: walletAddress,
            signature,
            signed_message: signedMessage,
            verified_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .select("id, chain, wallet_address, verified_at")
        .single();
      if (error) {
        throw error;
      }

      return NextResponse.json(
        {
          wallet: {
            id: data.id,
            chain: data.chain,
            walletAddress: data.wallet_address,
            verifiedAt: data.verified_at,
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

      if (apiPath === "admin/withdrawals" && request.method === "GET") {
        const { data, error } = await adminSupabase.rpc("rpc_admin_list_requested_withdrawals");
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

      if (apiPath.match(/^admin\/withdrawals\/[^/]+\/execute$/) && request.method === "POST") {
        const withdrawalId = apiPath.split("/")[2] ?? "";
        const body = (await request.json().catch(() => ({}))) as { txHash?: string };
        const { data, error } = await adminSupabase.rpc("rpc_admin_execute_withdrawal", {
          p_admin_user_id: adminActorId,
          p_withdrawal_id: withdrawalId,
          p_tx_hash: body.txHash ?? "",
        });
        if (error) {
          throw error;
        }
        return NextResponse.json(data);
      }

      if (apiPath.match(/^admin\/withdrawals\/[^/]+\/fail$/) && request.method === "POST") {
        const withdrawalId = apiPath.split("/")[2] ?? "";
        const body = (await request.json().catch(() => ({}))) as { reason?: string };
        const { data, error } = await adminSupabase.rpc("rpc_admin_fail_withdrawal", {
          p_admin_user_id: adminActorId,
          p_withdrawal_id: withdrawalId,
          p_reason: body.reason ?? "",
        });
        if (error) {
          throw error;
        }
        return NextResponse.json(data);
      }

      if (apiPath.match(/^admin\/markets\/[^/]+\/resolve$/) && request.method === "POST") {
        const marketId = apiPath.split("/")[2] ?? "";
        const body = await request.json().catch(() => ({}));
        const { data, error } = await adminSupabase.rpc("rpc_admin_resolve_market", {
          p_admin_user_id: adminActorId,
          p_market_id: marketId,
          p_payload: body,
        });
        if (error) {
          throw error;
        }
        return NextResponse.json(data);
      }
    }

    return NextResponse.json({ error: "Endpoint not implemented" }, { status: 404 });
  } catch (error) {
    console.error(`Error handling /${apiPath}:`, error);
    const message = error instanceof Error ? error.message : "Failed to fetch data";
    if (/SUPABASE_/.test(message)) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing or invalid", code: "SUPABASE_ENV_MISSING" },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: message, code: "API_REQUEST_FAILED" }, { status: 500 });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const PATCH = handleRequest;
