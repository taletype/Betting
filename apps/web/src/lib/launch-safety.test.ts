import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PolymarketPage from "../app/polymarket/page";
import { PolymarketTradeTicket } from "../app/external-markets/polymarket-trade-ticket";
import { ThirdwebWalletFundingCard, thirdwebDisclosure } from "../app/thirdweb-wallet-funding-card";
import RewardsPage from "../app/rewards/page";
import TermsPage from "../app/terms/page";
import PrivacyPage from "../app/privacy/page";
import RiskPage from "../app/risk/page";
import { ambassadorRewardRevenueKinds, revenueSourcePolicies } from "./revenue-model";
import { getSiteUrl } from "./site-url";

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

test("builder code stays out of client components and public env variables", () => {
  const offenders = walkTextFiles(repoRoot)
    .filter((file) => /\.(ts|tsx|js|mjs)$/.test(file))
    .filter((file) => readFileSync(file, "utf8").startsWith("\"use client\"") || readFileSync(file, "utf8").startsWith("'use client'"))
    .filter((file) => /POLY_BUILDER_CODE|POLYMARKET_BUILDER_CODE/.test(readFileSync(file, "utf8")));

  assert.deepEqual(offenders.map((file) => file.replace(`${repoRoot}/`, "")), []);

  const envExample = readFileSync(resolve(repoRoot, ".env.example"), "utf8");
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*POLY.*BUILDER|NEXT_PUBLIC_POLYMARKET_ROUTED_TRADING_ENABLED/);
  assert.match(envExample, /POLY_BUILDER_CODE=\n/);
  assert.match(envExample, /NEXT_PUBLIC_APP_LAUNCH_MODE=beta/);
  assert.match(envExample, /POLYMARKET_ROUTED_TRADING_ENABLED=false/);
  assert.match(envExample, /AMBASSADOR_AUTO_PAYOUT_ENABLED=false/);
});

test("share links use Vercel production URL before localhost fallback", (t) => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const previousProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const previousVercelUrl = process.env.VERCEL_URL;
  const previousPort = process.env.PORT;

  t.after(() => {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    if (previousProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previousProductionUrl;
    if (previousVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previousVercelUrl;
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
  });

  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "betting-web-ten.vercel.app";
  process.env.VERCEL_URL = "preview-bet.vercel.app";
  assert.equal(getSiteUrl(), "https://betting-web-ten.vercel.app");

  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
  process.env.PORT = "3007";
  assert.equal(getSiteUrl(), "http://127.0.0.1:3007");
});

test("public beta launch mode renders explicit disabled trading and manual payout state", async (t) => {
  const previousMode = process.env.NEXT_PUBLIC_APP_LAUNCH_MODE;
  const previousTrading = process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  const previousPayout = process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
  process.env.NEXT_PUBLIC_APP_LAUNCH_MODE = "beta";
  delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;

  t.after(() => {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_APP_LAUNCH_MODE;
    else process.env.NEXT_PUBLIC_APP_LAUNCH_MODE = previousMode;
    if (previousTrading === undefined) delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
    else process.env.POLYMARKET_ROUTED_TRADING_ENABLED = previousTrading;
    if (previousPayout === undefined) delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
    else process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED = previousPayout;
  });

  const markup = renderToStaticMarkup(await RewardsPage());
  assert.match(markup, /Beta 公開預覽/);
  assert.match(markup, /交易尚未啟用/);
  assert.match(markup, /非託管/);
  assert.match(markup, /人手審批/);
});

test("safe launch status reports beta mode with routed trading and auto payout disabled by default", async (t) => {
  const previousMode = process.env.NEXT_PUBLIC_APP_LAUNCH_MODE;
  const previousTrading = process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  const previousPayout = process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
  process.env.NEXT_PUBLIC_APP_LAUNCH_MODE = "beta";
  delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;

  t.after(() => {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_APP_LAUNCH_MODE;
    else process.env.NEXT_PUBLIC_APP_LAUNCH_MODE = previousMode;
    if (previousTrading === undefined) delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
    else process.env.POLYMARKET_ROUTED_TRADING_ENABLED = previousTrading;
    if (previousPayout === undefined) delete process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED;
    else process.env.AMBASSADOR_AUTO_PAYOUT_ENABLED = previousPayout;
  });

  const { getSafeLaunchStatus } = await import("../app/api/_shared/launch-status");
  const status = getSafeLaunchStatus();
  assert.equal(status.launchMode, "beta");
  assert.equal(status.routedTradingEnabled, false);
  assert.equal(status.autoPayoutEnabled, false);
});

test("external Polymarket UI and read API do not import internal ledger or balance mutation modules", () => {
  const files = [
    "apps/web/src/app/external-markets/external-markets-page.tsx",
    "apps/web/src/app/polymarket/page.tsx",
    "apps/web/src/app/polymarket/[slug]/page.tsx",
    "apps/web/src/app/external/markets/route.ts",
    "apps/web/src/app/external-markets/polymarket-trade-ticket.tsx",
    "apps/web/src/app/thirdweb-wallet-funding-card.tsx",
    "apps/web/src/app/external-markets/polymarket-routing-readiness.ts",
    "apps/web/src/app/api/_shared/external-market-read.ts",
    "apps/web/src/app/api/_shared/polymarket-orders.ts",
    "services/api/src/modules/external-markets/handlers.ts",
    "services/api/src/modules/external-markets/repository.ts",
    "services/api/src/modules/external-polymarket-routing/handlers.ts",
    "services/api/src/modules/external-polymarket-routing/submitter.ts",
  ];

  for (const file of files) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    assert.doesNotMatch(source, /@bet\/ledger|@bet\/trading|ledger_journals|ledger_entries|balanceDeltas|rpc_place_order/);
  }
});

test("Thirdweb funding CTA renders as non-custodial wallet utility without login", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ThirdwebWalletFundingCard, {
      surface: "polymarket_feed",
      walletConnected: false,
    }),
  );

  assert.match(markup, /連接錢包/);
  assert.match(markup, /增值錢包/);
  assert.match(markup, /Polygon \/ USDC/);
  assert.match(markup, /資金會進入你的錢包/);
  assert.match(markup, /本平台不會託管你的資金/);
  assert.match(markup, /單純增值錢包不代表已完成 Polymarket 交易/);
  assert.match(markup, new RegExp(thirdwebDisclosure));
  assert.match(markup, /錢包功能暫未啟用/);
  assert.doesNotMatch(markup, /spinner|載入中|loading/i);
  assert.doesNotMatch(markup, /已登入|管理員/);
});

test("Thirdweb connected wallet state is display-only and does not imply app login", () => {
  const fundingMarkup = renderToStaticMarkup(
    React.createElement(ThirdwebWalletFundingCard, {
      surface: "account",
      walletConnected: true,
    }),
  );
  assert.match(fundingMarkup, /錢包已連接/);

  const tradeMarkup = renderToStaticMarkup(
    React.createElement(PolymarketTradeTicket, {
      locale: "zh-HK",
      hasBuilderCode: true,
      featureEnabled: true,
      submitModeEnabled: true,
      walletConnected: true,
      loggedIn: false,
      hasCredentials: true,
      userSigningAvailable: true,
      marketTradable: true,
      orderValid: true,
      submitterAvailable: true,
      marketTitle: "Wallet only market",
      outcome: "Yes",
      side: "buy",
      price: 0.5,
      size: 10,
    }),
  );

  assert.match(tradeMarkup, /data-testid="top-blocking-reason">尚未登入/);
  assert.match(tradeMarkup, /disabled=""/);
});

test("Thirdweb revenue is platform-only v1 and excluded from ambassador rewards", () => {
  assert.deepEqual(ambassadorRewardRevenueKinds, ["polymarket_builder_fee"]);
  assert.equal(revenueSourcePolicies.polymarket_builder_fee.ambassadorRewardEligible, true);
  assert.equal(revenueSourcePolicies.thirdweb_developer_fee.ambassadorRewardEligible, false);
  assert.equal(revenueSourcePolicies.thirdweb_developer_fee.platformRevenueEligible, true);
  assert.equal(revenueSourcePolicies.thirdweb_fiat_provider_fee.platformRevenueEligible, false);
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
  assert.match(markup, /來源：Polymarket/);
  assert.match(markup, /資料來源：Polymarket API/);
  assert.doesNotMatch(markup, /前往 Polymarket|Open on Polymarket/);
});

test("ambassador and rewards routes stay public so pending referral capture can run before login", () => {
  const middleware = readFileSync(resolve(repoRoot, "apps/web/src/lib/supabase/middleware.ts"), "utf8");
  assert.match(middleware, /const adminPrefix = "\/admin"/);
  assert.doesNotMatch(middleware, /privatePrefixes/);
  assert.doesNotMatch(middleware, /"\/ambassador"|"\/rewards"/);
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
    assert.match(markup, /交易介面預覽/);
    assert.match(markup, /用戶需要自行簽署訂單/);
    assert.match(markup, /本平台不會代用戶下注或交易/);
    assert.match(markup, /不託管用戶在 Polymarket 的資金/);
    assert.match(markup, /data-testid="readiness-checklist"/);
    assert.match(markup, /正在檢查所在地區支援狀態/);
    assert.doesNotMatch(markup, /你目前所在地區暫不支援 Polymarket 下單/);
    assert.match(markup, /待生效 Maker 費率：0.5%/);
    assert.match(markup, /待生效 Taker 費率：1%/);
    assert.match(markup, /disabled=""/);
  } finally {
    if (originalFlag === undefined) delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
    else process.env.POLYMARKET_ROUTED_TRADING_ENABLED = originalFlag;
  }
});

test("Trade ticket shows one top readiness reason for specific missing gates", () => {
  const baseProps = {
    locale: "zh-HK" as const,
    hasBuilderCode: true,
    featureEnabled: true,
    walletConnected: true,
    geoblockAllowed: true,
    hasCredentials: true,
    userSigningAvailable: true,
    userSigned: true,
    marketTradable: true,
    orderValid: true,
    submitterAvailable: true,
    submitModeEnabled: true,
    loggedIn: true,
    marketTitle: "Readiness market",
    outcome: "Yes",
    tokenId: "yes",
    side: "buy" as const,
    price: 0.5,
    size: 10,
  };

  const walletMarkup = renderToStaticMarkup(React.createElement(PolymarketTradeTicket, { ...baseProps, walletConnected: false }));
  assert.match(walletMarkup, /data-testid="top-blocking-reason">尚未連接錢包/);
  assert.match(walletMarkup, /連接錢包/);

  const credentialMarkup = renderToStaticMarkup(React.createElement(PolymarketTradeTicket, { ...baseProps, hasCredentials: false }));
  assert.match(credentialMarkup, /data-testid="top-blocking-reason">需要 Polymarket 憑證/);

  const featureMarkup = renderToStaticMarkup(React.createElement(PolymarketTradeTicket, { ...baseProps, featureEnabled: false }));
  assert.match(featureMarkup, /data-testid="top-blocking-reason">交易介面預覽/);

  const builderMarkup = renderToStaticMarkup(React.createElement(PolymarketTradeTicket, { ...baseProps, hasBuilderCode: false }));
  assert.match(builderMarkup, /data-testid="top-blocking-reason">Builder Code 未設定/);
  assert.match(builderMarkup, /只影響下單，不影響瀏覽市場/);

  const blockedMarkup = renderToStaticMarkup(React.createElement(PolymarketTradeTicket, { ...baseProps, geoblockAllowed: false }));
  assert.match(blockedMarkup, /你目前所在地區暫不支援 Polymarket 下單/);

  const submitterMarkup = renderToStaticMarkup(React.createElement(PolymarketTradeTicket, { ...baseProps, submitterAvailable: false }));
  assert.match(submitterMarkup, /data-testid="top-blocking-reason">交易提交器未準備好/);

  const submitDisabledMarkup = renderToStaticMarkup(React.createElement(PolymarketTradeTicket, { ...baseProps, submitModeEnabled: false }));
  assert.match(submitDisabledMarkup, /data-testid="top-blocking-reason">實盤提交已停用/);
  assert.doesNotMatch(submitDisabledMarkup, /交易功能完成/);
});

test("rewards page presents rewards as manual approval accounting", async () => {
  const markup = renderToStaticMarkup(await RewardsPage());
  assert.match(markup, /人手審批|人工審批/);
  assert.match(markup, /待確認獎勵|獎勵/);
  assert.match(markup, /Polygon 上的 pUSD/);
  assert.match(markup, /實際支付不會自動執行/);
  assert.match(markup, /不會自動從金庫轉帳/);
});

test("required beta disclosure pages render risk, privacy, and terms copy", () => {
  const pages = [
    renderToStaticMarkup(React.createElement(TermsPage)),
    renderToStaticMarkup(React.createElement(PrivacyPage)),
    renderToStaticMarkup(React.createElement(RiskPage)),
  ].join("\n");

  assert.match(pages, /服務條款/);
  assert.match(pages, /私隱政策/);
  assert.match(pages, /風險披露/);
  assert.match(pages, /年齡及地區限制/);
  assert.match(pages, /所在地區/);
  assert.match(pages, /本平台不會代用戶下注或交易/);
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
    "managed betting",
  ];
  const pattern = new RegExp(forbiddenTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const offenders = walkTextFiles(repoRoot)
    .filter((file) => !/(\.test\.|\/node_modules\/|\/\.next\/)/.test(file))
    .filter((file) => !/docs\/(mvp-scope|invite-referral-funnel|ambassador-rewards-hk)\.md$/.test(file))
    .filter((file) => pattern.test(readFileSync(file, "utf8").replaceAll("本平台不設入會費", "")));

  assert.deepEqual(offenders.map((file) => file.replace(`${repoRoot}/`, "")), []);
});
