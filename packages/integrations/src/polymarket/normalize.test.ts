import assert from "node:assert/strict";
import test from "node:test";

import { normalizePolymarketMarket } from "./normalize";

test("normalizes gamma market payload into external market", () => {
  const market = normalizePolymarketMarket({
    id: "123",
    question: "Will it rain?",
    slug: "will-it-rain",
    tokens: [
      { token_id: "tok-yes", outcome: "Yes", bestBid: "0.42", bestAsk: "0.44", price: "0.43" },
      { token_id: "tok-no", outcome: "No", bestBid: "0.56", bestAsk: "0.58", price: "0.57" },
    ],
  });

  assert.ok(market);
  assert.equal(market?.externalId, "123");
  assert.equal(market?.outcomes[0]?.externalOutcomeId, "tok-yes");
  assert.equal(market?.outcomes[0]?.yesNo, "yes");
});

test("returns null for malformed upstream payload missing id/title", () => {
  const market = normalizePolymarketMarket({ id: "", question: "" });
  assert.equal(market, null);
});
