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
  mapExternalPolymarketRoutingError,
  routeExternalPolymarketOrder,
} from "./modules/external-polymarket-routing/handlers";
import { evaluatePolymarketPreflight } from "./modules/external-polymarket-routing/preflight";
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
  captureAmbassadorReferral,
  createAdminAmbassadorCode,
  disableAdminAmbassadorCode,
  getAdminAmbassadorOverview,
  getAmbassadorDashboard,
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
import { createLinkWalletChallenge, getLinkedWallet, getWalletLinkDomain, linkBaseWallet } from "./modules/wallets/handlers";
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

  if (user.role !== "admin") {
    const payload: ApiErrorResponse = { error: "admin authorization required" };
    return Response.json(payload, { status: 403 });
  }

  return null;
};

const isProductionRuntime = (): boolean => process.env.NODE_ENV === "production";

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

const handleRequest = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
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

    if (request.method === "GET" && url.pathname === "/external/markets") {
      const payload = await listExternalMarkets();
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/external/polymarket/orders/route") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

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
        const payload = await routeExternalPolymarketOrder(body, { requestUserId });
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

    if (request.method === "POST" && url.pathname === "/wallets/link") {
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

    if (request.method === "GET" && url.pathname === "/ambassador/dashboard") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const payload = await getAmbassadorDashboard(requestUserId);
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/ambassador/capture") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseBody(request);
      const payload = await captureAmbassadorReferralHandler({
        userId: requestUserId,
        code: String(body.code ?? body.ref ?? ""),
      });
      return new Response(toJson(payload), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/ambassador/payouts") {
      const unauthorized = requireAuthenticatedUser(requestUserId);
      if (unauthorized) {
        return unauthorized;
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

    if (request.method === "GET" && url.pathname === "/admin/ambassador") {
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

export { handleRequest, setAmbassadorCaptureHandlerForTests, setApiAuthVerifierForTests };
