import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import AmbassadorPage from "./page";

const dashboard = {
  ambassadorCode: {
    id: "11111111-1111-4111-8111-111111111111",
    code: "HKREF001",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    status: "active",
    inviteUrl: "https://bet.example/ambassador?ref=HKREF001",
    createdAt: "2026-05-01T00:00:00.000Z",
    disabledAt: null,
  },
  attribution: null,
  directReferrals: [],
  rewards: {
    pendingRewards: "1200000",
    payableRewards: "3400000",
    approvedRewards: "0",
    paidRewards: "5600000",
    voidRewards: "0",
    directReferralCount: 3,
    directTradingVolumeUsdcAtoms: "0",
  },
  rewardLedger: [],
  payouts: [],
};

const withDashboardFetch = async (run: () => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/api/ambassador/dashboard")) {
      return new Response(JSON.stringify(dashboard), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("ambassador page renders referral code UI and safe direct-referral copy", async () => {
  await withDashboardFetch(async () => {
    const markup = renderToStaticMarkup(
      await AmbassadorPage({
        searchParams: Promise.resolve({ slug: "will-hk-market-open" }),
      }),
    );

    assert.match(markup, /邀請朋友/);
    assert.match(markup, /推薦碼/);
    assert.match(markup, /HKREF001/);
    assert.match(markup, /推薦連結/);
    assert.match(markup, /複製推薦連結/);
    assert.match(markup, /data-copy-value="https:\/\/bet.example\/ambassador\?ref=HKREF001"/);
    assert.match(markup, /複製市場推薦連結/);
    assert.match(markup, /data-copy-value="http:\/\/127.0.0.1:3000\/polymarket\/will-hk-market-open\?ref=HKREF001"/);
    assert.match(markup, /直接推薦人數/);
    assert.match(markup, /待確認獎勵/);
    assert.match(markup, /可提取獎勵/);
    assert.match(markup, /已支付獎勵/);
    assert.match(markup, /分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易/);
    assert.match(markup, /參與推薦毋須付費；獎勵只限直接推薦及已確認 Builder 費用收入，平台不承諾收益，亦不會替用戶下單。/);
    assert.match(markup, /獎勵計算可自動記錄，但實際支付需要管理員審批。/);
    assert.match(markup, /實際支付不會自動執行，必須由管理員審批及記錄交易哈希。/);
    assert.match(markup, /請確認你的收款地址支援 Polygon 網絡。/);
    assert.doesNotMatch(markup, /交易餘額|trading balance|下線|recursive|downline|guaranteed profit/i);
  });
});

test("ambassador page falls back to the Polymarket feed invite link", async () => {
  await withDashboardFetch(async () => {
    const markup = renderToStaticMarkup(await AmbassadorPage());

    assert.match(markup, /data-copy-value="http:\/\/127.0.0.1:3000\/polymarket\?ref=HKREF001"/);
  });
});

test("ambassador page explains invite flow and shows auth CTAs when logged out", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  try {
    const markup = renderToStaticMarkup(await AmbassadorPage());

    assert.match(markup, /邀請朋友/);
    assert.match(markup, /分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易/);
    assert.match(markup, /登入/);
    assert.match(markup, /註冊/);
    assert.match(markup, /複製市場推薦連結/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
