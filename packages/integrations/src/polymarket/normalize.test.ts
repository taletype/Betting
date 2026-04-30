import assert from "node:assert/strict";
import test from "node:test";

import { normalizePolymarketMarket, resolvePolymarketMarketStatus } from "./normalize";

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

test("normalizes closed/resolved/cancelled and past close markets away from open", () => {
  const now = new Date("2026-04-30T12:00:00.000Z");

  assert.equal(normalizePolymarketMarket({
    id: "closed-flag",
    question: "Closed?",
    closed: true,
  })?.status, "closed");

  assert.equal(normalizePolymarketMarket({
    id: "resolved-market",
    question: "Resolved?",
    resolved_at: "2026-04-29T00:00:00.000Z",
  })?.status, "resolved");

  assert.equal(normalizePolymarketMarket({
    id: "cancelled-market",
    question: "Cancelled?",
    status: "cancelled",
  })?.status, "cancelled");

  assert.equal(normalizePolymarketMarket({
    id: "past-end",
    question: "Past end?",
    active: true,
    closed: false,
    endDate: "2026-04-29T00:00:00.000Z",
  })?.status, "closed");

  assert.equal(normalizePolymarketMarket({
    id: "future-end",
    question: "Future end?",
    active: true,
    closed: false,
    endDate: "2026-05-01T00:00:00.000Z",
  })?.status, "open");

  assert.equal(resolvePolymarketMarketStatus({
    active: true,
    closed: false,
    endDate: new Date(now.getTime() - 60_000).toISOString(),
  }, now), "closed");
});
