import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { routeExternalPolymarketOrder, type ExternalPolymarketOrderRoutePayload } from "./modules/external-polymarket-routing/handlers";
import { setExternalMarketsRepositoryForTests } from "./modules/external-markets/repository";

process.env.NODE_ENV = "test";
const VALID_BUILDER_CODE = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";
const getHandleRequest = async () => (await import("./server")).handleRequest;

const withEnv = async (values: Record<string, string | undefined>, run: () => Promise<void>) => {
  const prev = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(values)) {
    prev.set(k, process.env[k]);
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { await run(); } finally { for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};

test("missing builder code disables routed trading but read-only external markets still work", async (t) => {
  const handleRequest = await getHandleRequest();
  setExternalMarketsRepositoryForTests({ listExternalMarketRecords: async () => [{ id:"m1",source:"polymarket",externalId:"123",slug:"s",title:"t",description:"d",status:"open",marketUrl:"u",closeTime:null,endTime:null,resolvedAt:null,bestBid:1,bestAsk:1,lastTradePrice:1,volume24h:1,volumeTotal:1,lastSyncedAt:"2026-01-01T00:00:00.000Z",createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",outcomes:[],recentTrades:[],latestOrderbook:[] }], getExternalMarketRecord: async()=>null, listExternalMarketTrades: async()=>null });
  t.after(() => setExternalMarketsRepositoryForTests(null));
  await withEnv({ POLY_BUILDER_CODE: undefined, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    const readOnlyResponse = await handleRequest(new Request("http://localhost/external/markets"));
    assert.equal(readOnlyResponse.status, 200);
    const routingResponse = await handleRequest(new Request("http://localhost/external/polymarket/orders/route", { method:"POST", body: JSON.stringify({ orderInput: { tokenID: "123" } }) }));
    const payload = await routingResponse.json() as {code:string; error:string};
    assert.equal(routingResponse.status, 503); assert.equal(payload.code, "POLYMARKET_BUILDER_CODE_MISSING");
  });
});

test("external Polymarket routing stays disabled behind the named feature flag", async () => {
  const handleRequest = await getHandleRequest();
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: undefined }, async () => {
    const response = await handleRequest(new Request("http://localhost/external/polymarket/orders/route", { method:"POST", body: JSON.stringify({ orderInput: { tokenID: "123" } }) }));
    const payload = await response.json() as {code:string};
    assert.equal(response.status, 503); assert.equal(payload.code, "POLYMARKET_ROUTED_TRADING_DISABLED");
  });
});

test("external Polymarket routing attaches builderCode before submission", async () => {
  let submittedPayload: ExternalPolymarketOrderRoutePayload | null = null;
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    const result = await routeExternalPolymarketOrder({ userWalletAddress:"0xabc", l2CredentialStatus:"present", signedOrder:{sig:"0x1"}, orderType:"GTC", orderInput:{tokenID:"123"} }, { submitter: { submitOrder: async (payload) => { submittedPayload = payload; return { orderID:"1" }; } } });
    assert.equal(result.status, "submitted");
    assert.equal(submittedPayload?.orderInput.builderCode, VALID_BUILDER_CODE);
  });
});

test("external Polymarket routing rejects missing user signing", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await assert.rejects(() => routeExternalPolymarketOrder({ userWalletAddress:"0xabc", l2CredentialStatus:"present", orderInput:{tokenID:"123"} }, { submitter: { submitOrder: async () => ({}) } }), /user-signed order is required/);
  });
});

test("external Polymarket routing rejects missing Polymarket credentials", async () => {
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    await assert.rejects(() => routeExternalPolymarketOrder({ userWalletAddress:"0xabc", orderInput:{tokenID:"123"}, signedOrder:{sig:"0x1"}, l2CredentialStatus:"missing" }, { submitter: { submitOrder: async () => ({}) } }), /Polymarket credentials required/);
  });
});

test("external Polymarket routing returns submitter unavailable when not injected", async () => {
  const handleRequest = await getHandleRequest();
  await withEnv({ POLY_BUILDER_CODE: VALID_BUILDER_CODE, POLYMARKET_ROUTED_TRADING_ENABLED: "true" }, async () => {
    const response = await handleRequest(new Request("http://localhost/external/polymarket/orders/route", { method:"POST", body: JSON.stringify({ userWalletAddress:"0xabc", orderInput:{tokenID:"123"}, signedOrder:{sig:"0x1"}, l2CredentialStatus:"present" }) }));
    const payload = await response.json() as {code:string};
    assert.equal(response.status, 503); assert.equal(payload.code, "POLYMARKET_SUBMITTER_UNAVAILABLE");
  });
});

test("external Polymarket routing module does not import internal ledger or balance mutation paths", () => {
  const source = readFileSync(resolve(process.cwd(), "src/modules/external-polymarket-routing/handlers.ts"), "utf8");
  assert.doesNotMatch(source, /@bet\/ledger/); assert.doesNotMatch(source, /@bet\/trading/);
});
