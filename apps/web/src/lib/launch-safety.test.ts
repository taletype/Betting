import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PolymarketPage from "../app/polymarket/page";
import { PolymarketTradeTicket } from "../app/external-markets/polymarket-trade-ticket";
import RewardsPage from "../app/rewards/page";

const repoRoot = resolve(process.cwd(), "../..");

const walkTextFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (
      /(^|\/)(\.git|node_modules|\.next|dist|coverage|\.turbo)(\/|$)/.test(path) ||
      /pnpm-lock\.yaml$|tsconfig\.tsbuildinfo$/.test(path)
    ) {
      continue;
    }

    const stats = statSync(path);
    if (stats.isDirectory()) {
      walkTextFiles(path, out);
    } else if (/\.(ts|tsx|js|mjs|json|md|sql|env|example|yml|yaml)$/.test(path)) {
      out.push(path);
    }
  }

  return out;
};

test("no real Polymarket API secrets or private key assignments are committed", () => {
  const assignmentPattern =
    /\b(POLYMARKET_(API_SECRET|API_KEY|API_PASSPHRASE|CLOB_SECRET|CLOB_API_KEY|CLOB_PASSPHRASE)|PRIVATE_KEY)\s*=\s*(?!\s*(replace-me|changeme|placeholder|example|test)\b)/i;
  const offenders = walkTextFiles(repoRoot).filter((file) => assignmentPattern.test(readFileSync(file, "utf8")));

  assert.deepEqual(offenders.map((file) => file.replace(`${repoRoot}/`, "")), []);
});

test("external Polymarket UI and read API do not import internal ledger or balance mutation modules", () => {
  const files = [
    "apps/web/src/app/external-markets/external-markets-page.tsx",
    "apps/web/src/app/polymarket/page.tsx",
    "apps/web/src/app/polymarket/[slug]/page.tsx",
    "apps/web/src/app/external/markets/route.ts",
    "apps/web/src/app/external-markets/polymarket-trade-ticket.tsx",
    "apps/web/src/app/external-markets/polymarket-routing-readiness.ts",
    "apps/web/src/app/api/_shared/external-market-read.ts",
    "services/api/src/modules/external-markets/handlers.ts",
    "services/api/src/modules/external-markets/repository.ts",
    "services/api/src/modules/external-polymarket-routing/handlers.ts",
  ];

  for (const file of files) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    assert.doesNotMatch(source, /@bet\/ledger|@bet\/trading|ledger_journals|ledger_entries|balanceDeltas|rpc_place_order/);
  }
});

test("public external market browsing works without POLY_BUILDER_CODE", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBuilderCode = process.env.POLY_BUILDER_CODE;
  delete process.env.POLY_BUILDER_CODE;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "polymarket",
          externalId: "POLY-1",
          slug: "poly-1",
          title: "Will public browsing stay available?",
          description: "Safety test",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-1",
          closeTime: null,
          endTime: null,
          resolvedAt: null,
          bestBid: 0.5,
          bestAsk: 0.52,
          lastTradePrice: 0.51,
          volume24h: 10,
          volumeTotal: 100,
          lastSyncedAt: "2026-05-01T01:00:00.000Z",
          createdAt: "2026-05-01T01:00:00.000Z",
          updatedAt: "2026-05-01T01:00:00.000Z",
          outcomes: [],
          recentTrades: [],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBuilderCode === undefined) delete process.env.POLY_BUILDER_CODE;
    else process.env.POLY_BUILDER_CODE = originalBuilderCode;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /Will public browsing stay available/);
  assert.match(markup, /polymarket/);
});

test("Trade via Polymarket ticket is disabled by default", () => {
  const originalFlag = process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  try {
    const markup = renderToStaticMarkup(
      React.createElement(PolymarketTradeTicket, {
        locale: "zh-HK",
        hasBuilderCode: true,
        featureEnabled: process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true",
        walletConnected: true,
        hasCredentials: true,
        marketTradable: true,
        submitterAvailable: true,
        marketTitle: "Safety market",
        outcome: "Yes",
        side: "buy",
        price: 0.5,
        size: 10,
      }),
    );

    assert.match(markup, /透過 Polymarket 交易/);
    assert.match(markup, /交易功能尚未啟用/);
    assert.match(markup, /用戶需要自行簽署訂單/);
    assert.match(markup, /本平台不會代用戶下注或交易/);
    assert.match(markup, /不託管用戶在 Polymarket 的資金/);
    assert.match(markup, /待生效 0.5%/);
    assert.match(markup, /待生效 1%/);
    assert.match(markup, /disabled=""/);
  } finally {
    if (originalFlag === undefined) delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
    else process.env.POLYMARKET_ROUTED_TRADING_ENABLED = originalFlag;
  }
});

test("rewards page presents rewards as manual approval accounting", async () => {
  const markup = renderToStaticMarkup(await RewardsPage());
  assert.match(markup, /人手審批|人工審批/);
  assert.match(markup, /待確認獎勵|獎勵/);
  assert.match(markup, /Polygon 上的 pUSD/);
  assert.match(markup, /實際支付不會自動執行/);
  assert.match(markup, /不會自動從金庫轉帳/);
});

test("Builder fee disclosures show pending 0.5 percent maker and 1 percent taker without browsing fees", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /待生效 Maker 費率：0.5%/);
  assert.match(markup, /待生效 Taker 費率：1%/);
  assert.match(markup, /單純瀏覽市場不會產生 Builder 費用/);
});

test("no recursive referral payout fields are present in reward migrations", () => {
  const migrationPath = resolve(repoRoot, "supabase/migrations/0021_ambassador_rewards.sql");
  assert.equal(existsSync(migrationPath), true);

  const migration = readFileSync(migrationPath, "utf8");
  assert.doesNotMatch(migration, /parent_referrer_id|sponsor_tree|ancestor|closure|nested|binary|matrix|spillover|level_[0-9]|with recursive|second_level/i);
});

test("forbidden reward and trading wording does not appear in non-test product files", () => {
  const forbiddenTerms = [
    "傳銷",
    "下線收益",
    "上線收益",
    "發展下線",
    "被動收入",
    "躺賺",
    "包賺",
    "保證回報",
    "代客下注",
    "代客交易",
    "入會費",
    "套餐解鎖收益",
    "MLM",
    "downline",
    "passive income",
    "guaranteed profit",
  ];
  const pattern = new RegExp(forbiddenTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const offenders = walkTextFiles(repoRoot)
    .filter((file) => !/(\.test\.|\/node_modules\/|\/\.next\/)/.test(file))
    .filter((file) => pattern.test(readFileSync(file, "utf8")));

  assert.deepEqual(offenders.map((file) => file.replace(`${repoRoot}/`, "")), []);
});
