export const apiOpenApiSource = {
  openapi: "3.1.0",
  info: {
    title: "Bet API",
    version: "0.1.0",
    description: "Hand-authored OpenAPI source aligned to implemented HTTP routes.",
  },
  paths: {
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
  },
} as const;

export type ApiOpenApiSource = typeof apiOpenApiSource;
