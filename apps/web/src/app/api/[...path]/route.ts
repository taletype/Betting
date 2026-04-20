import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";
import { readMarketById, readMarketOrderBook, readMarkets, readMarketTrades } from "../_shared/market-read";

import { canUseDevHeaderOverride, DEV_USER_HEADER, isAdminRole, resolveUserId } from "../auth";

async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const apiPath = path.join("/");
  const supabase = createSupabaseAdminClient();

  try {
    if (apiPath === "health" && request.method === "GET") {
      return NextResponse.json({ ok: true, service: "api", checkedAt: new Date().toISOString() });
    }

    if (apiPath === "markets" && request.method === "GET") {
      return NextResponse.json(await readMarkets(supabase));
    }

    if (apiPath.match(/^markets\/[^/]+$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";

      const market = await readMarketById(supabase, marketId);
      if (!market) {
        return NextResponse.json({ market: null }, { status: 404 });
      }
      return NextResponse.json({ market });
    }

    if (apiPath.match(/^markets\/[^/]+\/orderbook$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";
      return NextResponse.json(await readMarketOrderBook(supabase, marketId));
    }

    if (apiPath.match(/^markets\/[^/]+\/trades$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";
      return NextResponse.json(await readMarketTrades(supabase, marketId));
    }

    const user = await getAuthenticatedUser(request);
    const userId = resolveUserId({
      sessionUserId: user?.id,
      requestHeaderUserId: request.headers.get(DEV_USER_HEADER),
      allowDevHeaderOverride: canUseDevHeaderOverride({
        nodeEnv: process.env.NODE_ENV,
        allowDevIdentityHeader: process.env.ALLOW_DEV_IDENTITY_HEADER,
      }),
    });

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (apiPath === "portfolio" && request.method === "GET") {
      const { data, error } = await supabase.rpc("rpc_get_portfolio_snapshot", {
        p_user_id: userId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data);
    }

    if (apiPath === "withdrawals" && request.method === "GET") {
      const { data, error } = await supabase.rpc("rpc_list_withdrawals", {
        p_user_id: userId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json({ withdrawals: data ?? [] });
    }

    if (apiPath === "deposits/verify" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { txHash?: string };
      const { data, error } = await supabase.rpc("rpc_verify_deposit", {
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
      const { data, error } = await supabase.rpc("rpc_request_withdrawal", {
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
      const { data, error } = await supabase.rpc("rpc_place_order", {
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
      const { data, error } = await supabase.rpc("rpc_cancel_order", {
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
      const { data, error } = await supabase.rpc("rpc_claim_payout", {
        p_user_id: userId,
        p_market_id: marketId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data, { status: 201 });
    }

    if (apiPath.startsWith("admin/")) {
      if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      if (!isAdminRole(getUserRole(user))) {
        return NextResponse.json({ error: "Admin privileges required" }, { status: 403 });
      }

      const adminActorId = user.id;

      if (apiPath === "admin/withdrawals" && request.method === "GET") {
        const { data, error } = await supabase.rpc("rpc_admin_list_requested_withdrawals");
        if (error) {
          throw error;
        }
        return NextResponse.json({ withdrawals: data ?? [] });
      }

      if (apiPath.match(/^admin\/withdrawals\/[^/]+\/execute$/) && request.method === "POST") {
        const withdrawalId = apiPath.split("/")[2] ?? "";
        const body = (await request.json().catch(() => ({}))) as { txHash?: string };
        const { data, error } = await supabase.rpc("rpc_admin_execute_withdrawal", {
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
        const { data, error } = await supabase.rpc("rpc_admin_fail_withdrawal", {
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
        const { data, error } = await supabase.rpc("rpc_admin_resolve_market", {
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
