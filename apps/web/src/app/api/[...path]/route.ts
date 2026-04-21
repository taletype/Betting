import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "ethers";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@bet/supabase";
import { readMarketById, readMarketOrderBook, readMarketTrades } from "../_shared/market-read";
import { normalizeApiPayload } from "../_shared/api-serialization";
import { getMarketsResponse } from "../_shared/market-route-response";
import { readExternalMarkets } from "../_shared/external-market-read";

import {
  evaluateAdminAccess,
  getAuthenticatedUser,
} from "../auth";

const normalizeAddress = (value: string): string => value.trim().toLowerCase();

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
  const adminSupabase = createSupabaseAdminClient();

  try {
    if (apiPath === "health" && request.method === "GET") {
      return NextResponse.json({ ok: true, service: "api", checkedAt: new Date().toISOString() });
    }

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

    const user = await getAuthenticatedUser(request);
    const userId = user?.id ?? null;

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
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const PATCH = handleRequest;
