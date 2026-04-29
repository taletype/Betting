export const apiOpenApiSource = {
  openapi: "3.1.0",
  info: {
    title: "Bet API",
    version: "0.1.0",
    description: "Hand-authored OpenAPI source aligned to implemented HTTP routes.",
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
    "/ready": {
      get: {
        summary: "Readiness check",
        responses: { "200": { description: "OK" } },
      },
    },
    "/markets": {
      get: {
        summary: "List markets",
        responses: { "200": { description: "OK" } },
      },
    },
    "/markets/{marketId}": {
      get: {
        summary: "Get market by id",
        parameters: [{ name: "marketId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/markets/{marketId}/orderbook": {
      get: {
        summary: "Get market orderbook",
        parameters: [{ name: "marketId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/markets/{marketId}/trades": {
      get: {
        summary: "Get recent market trades",
        parameters: [{ name: "marketId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/orders": {
      post: {
        summary: "Create order",
        responses: { "202": { description: "Accepted" }, "429": { description: "Rate limited" } },
      },
    },
    "/orders/{orderId}": {
      delete: {
        summary: "Cancel order",
        parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" }, "429": { description: "Rate limited" } },
      },
    },
    "/portfolio": {
      get: {
        summary: "Get portfolio snapshot",
        responses: { "200": { description: "OK" } },
      },
    },
    "/claims": {
      get: {
        summary: "List claims and claimable states",
        responses: { "200": { description: "OK" } },
      },
    },
    "/claims/{marketId}/state": {
      get: {
        summary: "Get claimable state for market",
        parameters: [{ name: "marketId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/claims/{marketId}": {
      post: {
        summary: "Submit claim for resolved market",
        parameters: [{ name: "marketId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/deposits": {
      get: {
        summary: "Get deposit history",
        responses: { "200": { description: "OK" } },
      },
    },
    "/deposits/verify": {
      post: {
        summary: "Verify base deposit",
        responses: { "200": { description: "OK" } },
      },
    },
    "/withdrawals": {
      get: {
        summary: "Get withdrawal history",
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Create withdrawal request",
        responses: { "201": { description: "Created" } },
      },
    },
    "/admin/markets/{marketId}/resolve": {
      post: {
        summary: "Resolve a market",
        parameters: [{ name: "marketId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/admin/withdrawals/{withdrawalId}/execute": {
      post: {
        summary: "Execute requested withdrawal",
        parameters: [{ name: "withdrawalId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/admin/withdrawals/{withdrawalId}/fail": {
      post: {
        summary: "Fail requested withdrawal",
        parameters: [{ name: "withdrawalId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/external/markets": {
      get: {
        summary: "List synced external markets",
        responses: { "200": { description: "OK" } },
      },
    },
    "/external/markets/{source}/{externalId}": {
      get: {
        summary: "Get external market by source and external id",
        parameters: [
          { name: "source", in: "path", required: true, schema: { type: "string", enum: ["polymarket", "kalshi"] } },
          { name: "externalId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/external/markets/{source}/{externalId}/orderbook": {
      get: {
        summary: "Get latest external orderbook snapshots by market",
        parameters: [
          { name: "source", in: "path", required: true, schema: { type: "string", enum: ["polymarket", "kalshi"] } },
          { name: "externalId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/external/markets/{source}/{externalId}/trades": {
      get: {
        summary: "Get imported external trades by market",
        parameters: [
          { name: "source", in: "path", required: true, schema: { type: "string", enum: ["polymarket", "kalshi"] } },
          { name: "externalId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/external/polymarket/orders/route": {
      post: {
        summary: "Scaffold external Polymarket order routing with builder attribution",
        responses: {
          "202": { description: "Accepted by external router" },
          "501": { description: "User signing/API credential flow not wired" },
          "503": { description: "External Polymarket routed trading disabled" },
        },
      },
    },
  },
} as const;

export type ApiOpenApiSource = typeof apiOpenApiSource;
