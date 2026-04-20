import { createServer } from "node:http";

import { createDatabaseClient } from "@bet/db";
import { incrementCounter, logger } from "@bet/observability";

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
import { getDepositHistory, verifyDeposit } from "./modules/deposits/handlers";
import { getLinkedWallet, linkBaseWallet } from "./modules/wallets/handlers";
import { checkRateLimit } from "./modules/shared/rate-limit";
import { toJson } from "./presenters/json";

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

const handleRequest = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const actorIdentity = request.headers.get("x-user-id") ?? "anonymous";
    const idempotencyKey = request.headers.get("idempotency-key");
    const segments = url.pathname.split("/").filter(Boolean);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(getHealth());
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      const db = createDatabaseClient();
      await db.query("select 1");
      return Response.json({ ok: true, service: "api", ready: true, checkedAt: new Date().toISOString() });
    }

    if (request.method === "GET" && url.pathname === "/external/markets") {
      return new Response(toJson(await listExternalMarkets()), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/external/markets/")) {
      const [, , , source, ...idParts] = url.pathname.split("/");
      const externalId = decodeURIComponent(idParts.join("/"));
      const market = await getExternalMarketBySourceAndId(source ?? "", externalId);
      return new Response(toJson({ market }), {
        headers: { "content-type": "application/json" },
        status: market ? 200 : 404,
      });
    }

    if (request.method === "GET" && url.pathname === "/markets") {
      return new Response(toJson(await listMarkets()), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "markets" &&
      segments[2] === "orderbook"
    ) {
      return new Response(toJson(await getOrderBookByMarketId(segments[1] ?? "")), {
        headers: { "content-type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "markets" &&
      segments[2] === "trades"
    ) {
      return new Response(toJson(await getTradesByMarketId(segments[1] ?? "")), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "markets") {
      const market = await getMarketById(segments[1] ?? "");
      return new Response(toJson({ market }), {
        headers: { "content-type": "application/json" },
        status: market ? 200 : 404,
      });
    }

    if (request.method === "POST" && url.pathname === "/orders") {
      const rateLimit = checkRateLimit("orderPlacement", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "orders" });
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const body = await parseBody(request);
      const result = await createOrder({
        marketId: String(body.marketId ?? ""),
        outcomeId: String(body.outcomeId ?? ""),
        side: body.side === "sell" ? "sell" : "buy",
        orderType: body.orderType === "market" ? "market" : "limit",
        price: BigInt(String(body.price ?? "0")),
        quantity: BigInt(String(body.quantity ?? "0")),
        clientOrderId: body.clientOrderId ? String(body.clientOrderId) : null,
        idempotencyKey,
      });

      return new Response(toJson(result), {
        headers: { "content-type": "application/json" },
        status: 202,
      });
    }

    if (request.method === "DELETE" && segments.length === 2 && segments[0] === "orders") {
      const rateLimit = checkRateLimit("orderCancel", actorIdentity);
      if (!rateLimit.allowed) {
        incrementCounter("rate_limited_total", { scope: "order_cancel" });
        return Response.json(
          { error: "rate limit exceeded" },
          { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const result = await cancelOrder({ orderId: segments[1] ?? "" });
      return new Response(toJson(result), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    if (request.method === "GET" && url.pathname === "/portfolio") {
      return new Response(toJson(await getPortfolio(getRequestUserId(request))), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/wallets/linked") {
      return new Response(toJson({ wallet: await getLinkedWallet(getRequestUserId(request)) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/wallets/link") {
      const body = await parseBody(request);
      const linkedWallet = await linkBaseWallet({
        userId: getRequestUserId(request),
        walletAddress: String(body.walletAddress ?? ""),
        signature: String(body.signature ?? ""),
        signedMessage: String(body.signedMessage ?? ""),
      });

      return new Response(toJson({ wallet: linkedWallet }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/deposits") {
      return new Response(toJson({ deposits: await getDepositHistory(getRequestUserId(request)) }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/deposits/verify") {
      const body = await parseBody(request);
      const result = await verifyDeposit({
        userId: getRequestUserId(request),
        txHash: String(body.txHash ?? ""),
      });
      return new Response(toJson(result), {
        headers: { "content-type": "application/json" },
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("api request failed", { error: message });
    return Response.json({ error: message }, { status: 400 });
  }
};

if (process.env.NODE_ENV !== "test") {
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
