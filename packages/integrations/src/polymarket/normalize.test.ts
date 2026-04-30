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

test("image URL is normalized from optimized image", () => {
  const market = normalizePolymarketMarket({
    id: "123",
    question: "Will it rain?",
    imageOptimized: { imageUrlOptimized: "https://polymarket-upload.s3.us-east-2.amazonaws.com/optimized.png" },
  });

  assert.equal(market?.imageUrl, "https://polymarket-upload.s3.us-east-2.amazonaws.com/optimized.png");
  assert.equal(market?.imageSourceUrl, market?.imageUrl);
});

test("image fallback priority uses event images before icon", () => {
  const market = normalizePolymarketMarket({
    id: "123",
    question: "Will it rain?",
    icon: "https://example.com/icon.png",
    events: [{
      featuredImage: "https://example.com/featured.png",
    }],
  });

  assert.equal(market?.imageUrl, "https://example.com/featured.png");
  assert.equal(market?.iconUrl, "https://example.com/icon.png");
});

test("missing image is safe", () => {
  const market = normalizePolymarketMarket({
    id: "123",
    question: "Will it rain?",
  });

  assert.equal(market?.imageUrl, null);
  assert.equal(market?.iconUrl, null);
  assert.equal(market?.imageSourceUrl, null);
  assert.equal(market?.imageUpdatedAt, null);
});

test("invalid image URLs are rejected", () => {
  const market = normalizePolymarketMarket({
    id: "123",
    question: "Will it rain?",
    image: "javascript:alert(1)",
    twitterCardImage: "data:image/png;base64,abc",
    icon: "file:///tmp/example.png",
  });

  assert.equal(market?.imageUrl, null);
  assert.equal(market?.iconUrl, null);
});

test("normalize source contains no scraping code paths", async () => {
  const { readFile } = await import("node:fs/promises");
  const file = await readFile(new URL("./gamma.ts", import.meta.url), "utf8");

  assert.match(file, /gamma-api\.polymarket\.com/);
  assert.doesNotMatch(file, /fetch\([^)]*polymarket\.com\//);
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
