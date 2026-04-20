import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient, getUserRole } from "@bet/supabase";

import { canUseDevHeaderOverride, DEV_USER_HEADER, isAdminRole, resolveUserId } from "../auth";

const toIso = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
};

const toStringAmount = (value: string | number | bigint | null | undefined): string => {
  if (value === null || value === undefined) {
    return "0";
  }

  return String(value);
};

const getAuthenticatedUser = async (request: NextRequest) => {
  const userClient = createSupabaseServerClient({
    get: (name) => request.cookies.get(name)?.value,
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error) {
    throw error;
  }

  return user;
};

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
      const { data: marketRows, error: marketError } = await supabase
        .from("markets")
        .select("id, slug, title, description, status, collateral_currency, min_price, max_price, tick_size, close_time, resolve_time, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

      if (marketError) {
        throw marketError;
      }

      if (!marketRows || marketRows.length === 0) {
        return NextResponse.json([]);
      }

      const marketIds = marketRows.map((row) => row.id);
      const { data: outcomeRows, error: outcomeError } = await supabase
        .from("outcomes")
        .select("id, market_id, slug, title, outcome_index, created_at")
        .in("market_id", marketIds)
        .order("market_id", { ascending: true })
        .order("outcome_index", { ascending: true });

      if (outcomeError) {
        throw outcomeError;
      }

      const outcomesByMarketId = new Map<string, Array<Record<string, unknown>>>();
      for (const row of outcomeRows ?? []) {
        const outcomes = outcomesByMarketId.get(row.market_id) ?? [];
        outcomes.push({
          id: row.id,
          marketId: row.market_id,
          slug: row.slug,
          title: row.title,
          index: row.outcome_index,
          createdAt: toIso(row.created_at),
        });
        outcomesByMarketId.set(row.market_id, outcomes);
      }

      return NextResponse.json(
        marketRows.map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          description: row.description,
          status: row.status,
          collateralCurrency: row.collateral_currency,
          minPrice: toStringAmount(row.min_price),
          maxPrice: toStringAmount(row.max_price),
          tickSize: toStringAmount(row.tick_size),
          createdAt: toIso(row.created_at),
          closesAt: toIso(row.close_time),
          resolvesAt: toIso(row.resolve_time),
          outcomes: outcomesByMarketId.get(row.id) ?? [],
          stats: {
            bestBid: null,
            bestAsk: null,
            lastTradePrice: null,
            volumeNotional: "0",
          },
        })),
      );
    }

    if (apiPath.match(/^markets\/[^/]+$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";

      const { data: marketRow, error: marketError } = await supabase
        .from("markets")
        .select("id, slug, title, description, status, collateral_currency, min_price, max_price, tick_size, close_time, resolve_time, created_at")
        .eq("id", marketId)
        .maybeSingle();

      if (marketError) {
        throw marketError;
      }

      if (!marketRow) {
        return NextResponse.json({ market: null }, { status: 404 });
      }

      const { data: outcomeRows, error: outcomeError } = await supabase
        .from("outcomes")
        .select("id, market_id, slug, title, outcome_index, created_at")
        .eq("market_id", marketId)
        .order("outcome_index", { ascending: true });

      if (outcomeError) {
        throw outcomeError;
      }

      return NextResponse.json({
        market: {
          id: marketRow.id,
          slug: marketRow.slug,
          title: marketRow.title,
          description: marketRow.description,
          status: marketRow.status,
          collateralCurrency: marketRow.collateral_currency,
          minPrice: toStringAmount(marketRow.min_price),
          maxPrice: toStringAmount(marketRow.max_price),
          tickSize: toStringAmount(marketRow.tick_size),
          createdAt: toIso(marketRow.created_at),
          closesAt: toIso(marketRow.close_time),
          resolvesAt: toIso(marketRow.resolve_time),
          outcomes: (outcomeRows ?? []).map((row) => ({
            id: row.id,
            marketId: row.market_id,
            slug: row.slug,
            title: row.title,
            index: row.outcome_index,
            createdAt: toIso(row.created_at),
          })),
          stats: {
            bestBid: null,
            bestAsk: null,
            lastTradePrice: null,
            volumeNotional: "0",
          },
        },
      });
    }

    if (apiPath.match(/^markets\/[^/]+\/orderbook$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";
      const { data, error } = await supabase.rpc("rpc_get_market_orderbook", {
        p_market_id: marketId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data ?? { marketId, levels: [] });
    }

    if (apiPath.match(/^markets\/[^/]+\/trades$/) && request.method === "GET") {
      const marketId = apiPath.split("/")[1] ?? "";
      const { data, error } = await supabase.rpc("rpc_get_recent_market_trades", {
        p_market_id: marketId,
      });
      if (error) {
        throw error;
      }
      return NextResponse.json(data ?? { marketId, trades: [] });
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
