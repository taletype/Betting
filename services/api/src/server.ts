import { createServer } from "node:http";

import { createDatabaseClient } from "@bet/db";
import { incrementCounter, logger } from "@bet/observability";
import { createSupabaseAdminClient } from "@bet/supabase";
import type {
  ApiErrorResponse,
  ApiHealthResponse,
  ApiReadyResponse,
} from "@bet/contracts";

import { getExternalMarketBySourceAndId, listExternalMarkets } from "./modules/external-markets/handlers";
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
  activateAdminCommissionPlan,
  createAdminCommissionPlan,
  getAdminMlmOverview,
  getMlmDashboard,
  joinReferralProgram,
  overrideReferralSponsor,
} from "./modules/mlm/handlers";
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
import { getLinkedWallet, linkBaseWallet } from "./modules/wallets/handlers";
import { checkRateLimit } from "./modules/shared/rate-limit";
import { DEMO_USER_ID } from "./modules/shared/constants";
import {
  isDepositVerificationDisabled,
  isGlobalOrderPlacementDisabled,
  isOrderPlacementDisabledForMarket,
  isWithdrawalRequestDisabled,
} from "./modules/shared/kill-switches";
import { toJson } from "./presenters/json";
import { getAdminApiToken, validateApiEnvironment } from "./env";

const port = Number(process.env.PORT ?? 4000);

const parseBody = async (request: Request): Promise<Record<string, unknown>> => {
  const body = await request.text();
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
};

const readIncomingMessage = async (request: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const getRequestUserId = (request: Request): string | undefined => {
  const userId = request.headers.get("x-user-id");
  return userId ?? undefined;
};

let supabaseAdminClient: ReturnType<typeof createSupabaseAdminClient> | null = null;

const getBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
};

const resolveRequestUserId = async (request: Request): Promise<string | undefined> => {
  const bearerToken = getBearerToken(request);
  if (bearerToken) {
    try {
      if (!supabaseAdminClient) {
        supabaseAdminClient = createSupabaseAdminClient();
      }

      const { data, error } = await supabaseAdminClient.auth.getUser(bearerToken);
      if (!error && data.user?.id) {
        return data.user.id;
      }
    } catch {
      // Fall through to non-production shortcuts.
    }
  }

  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return getRequestUserId(request) ?? DEMO_USER_ID;
};

const isAdminRequest = (request: Request): boolean => {
  const incoming = request.headers.get("x-admin-token");
  const expected = getAdminApiToken();
  return Boolean(incoming) && incoming === expected;
};

const requireAuthenticatedUser = (requestUserId: string | undefined): Response | null => {
  if (requestUserId) {
    return null;
  }

  const payload: ApiErrorResponse = { error: "authentication required" };
  return Response.json(payload, { status: 401 });
};

const handleRequest = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const requestUserId = await resolveRequestUserId(request);
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
      if (!isAdminRequest(request)) {
        const payload: ApiErrorResponse = { error: "admin authorization required" };
        return Response.json(payload, { status: 401 });
      }

      const payload = await runExternalSync();
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 202,
      });
    }

    if (request.method === "GET" && url.pathname === "/external/markets") {
      const payload = await listExternalMarkets();
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
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

    if (request.method === "POST" && url.pathname === "/wallets/link") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseBody(request);
      const linkedWallet = await linkBaseWallet({
        userId: requestUserId,
        walletAddress: String(body.walletAddress ?? ""),
        signature: String(body.signature ?? ""),
        signedMessage: String(body.signedMessage ?? ""),
      });

      return new Response(toJson({ wallet: linkedWallet }), {
        headers: { "content-type": "application/json" },
      });
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

    if (request.method === "GET" && url.pathname === "/mlm/dashboard") {
      const payload = await getMlmDashboard(getRequestUserId(request));
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/mlm/join") {
      const body = await parseBody(request);
      const payload = await joinReferralProgram({
        userId: getRequestUserId(request),
        code: String(body.code ?? ""),
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
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
      const body = await parseBody(request);
      const result = await resolveMarket({
        marketId: segments[2] ?? "",
        winningOutcomeId: String(body.winningOutcomeId ?? ""),
        evidenceText: String(body.evidenceText ?? ""),
        evidenceUrl: body.evidenceUrl ? String(body.evidenceUrl) : null,
        resolverId: String(body.resolverId ?? ""),
        isAdmin: isAdminRequest(request),
      });
      const payload = result;
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/withdrawals") {
      return new Response(toJson({ withdrawals: await getRequestedWithdrawals({ isAdmin: isAdminRequest(request) }) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/mlm") {
      if (!isAdminRequest(request)) {
        const payload: ApiErrorResponse = { error: "admin authorization required" };
        return Response.json(payload, { status: 401 });
      }

      const payload = await getAdminMlmOverview();
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/admin/mlm/plans") {
      if (!isAdminRequest(request)) {
        const payload: ApiErrorResponse = { error: "admin authorization required" };
        return Response.json(payload, { status: 401 });
      }

      const body = await parseBody(request);
      const levels = Array.isArray(body.levels)
        ? body.levels.map((level) => ({
            levelDepth: Number((level as { levelDepth?: unknown }).levelDepth ?? 0),
            rateBps: Number((level as { rateBps?: unknown }).rateBps ?? 0),
          }))
        : [];
      const payload = await createAdminCommissionPlan({
        adminUserId: getRequestUserId(request) ?? DEMO_USER_ID,
        name: String(body.name ?? "MLM Plan"),
        levels,
        activate: Boolean(body.activate),
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "mlm" &&
      segments[2] === "plans"
    ) {
      if (!isAdminRequest(request)) {
        const payload: ApiErrorResponse = { error: "admin authorization required" };
        return Response.json(payload, { status: 401 });
      }

      await activateAdminCommissionPlan({
        adminUserId: getRequestUserId(request) ?? DEMO_USER_ID,
        planId: segments[3] ?? "",
      });
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/admin/mlm/relationships/override") {
      if (!isAdminRequest(request)) {
        const payload: ApiErrorResponse = { error: "admin authorization required" };
        return Response.json(payload, { status: 401 });
      }

      const body = await parseBody(request);
      await overrideReferralSponsor({
        adminUserId: getRequestUserId(request) ?? DEMO_USER_ID,
        referredUserId: String(body.referredUserId ?? ""),
        sponsorCode: String(body.sponsorCode ?? ""),
        reason: String(body.reason ?? ""),
      });
      return Response.json({ ok: true });
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "admin" &&
      segments[1] === "withdrawals" &&
      segments[3] === "execute"
    ) {
      const body = await parseBody(request);
      const result = await executeWithdrawal({
        adminUserId: requestUserId,
        isAdmin: isAdminRequest(request),
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
      const body = await parseBody(request);
      const result = await resolveMarket({
        marketId: segments[2] ?? "",
        winningOutcomeId: String(body.winningOutcomeId ?? ""),
        evidenceText: String(body.evidenceText ?? ""),
        evidenceUrl: body.evidenceUrl ? String(body.evidenceUrl) : null,
        resolverId: String(body.resolverId ?? ""),
        isAdmin: isAdminRequest(request),
      });
      return new Response(toJson(result), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/withdrawals") {
      return new Response(toJson({ withdrawals: await getRequestedWithdrawals({ isAdmin: isAdminRequest(request) }) }), {
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
      const body = await parseBody(request);
      const result = await executeWithdrawal({
        adminUserId: requestUserId,
        isAdmin: isAdminRequest(request),
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
      const body = await parseBody(request);
      const result = await failWithdrawal({
        adminUserId: requestUserId,
        isAdmin: isAdminRequest(request),
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
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("api request failed", { error: message });
    const payload: ApiErrorResponse = { error: message };
    return Response.json(payload, { status: 400 });
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

export { handleRequest };
