import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderRewardsPage as renderRewardsPageView } from "./page";

type FetchMock = typeof globalThis.fetch;
const user = { id: "user-real-123", email: "real.user@example.com" };

const dashboardResponse = (overrides?: Partial<Record<string, unknown>>) => ({
  ambassadorCode: {
    id: "11111111-1111-4111-8111-111111111111",
    code: "DEMO1001",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    status: "active",
    inviteUrl: "http://127.0.0.1:3000/ambassador?ref=DEMO1001",
    createdAt: "2026-04-22T00:00:00.000Z",
    disabledAt: null,
  },
  attribution: null,
  directReferrals: [],
  rewards: {
    pendingRewards: "1250000",
    payableRewards: "5000000",
    approvedRewards: "2000000",
    paidRewards: "3000000",
    voidRewards: "0",
    directReferralCount: 1,
    directTradingVolumeUsdcAtoms: "100000000",
  },
  rewardLedger: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      recipientUserId: "22222222-2222-4222-8222-222222222222",
      sourceTradeAttributionId: "44444444-4444-4444-8444-444444444444",
      rewardType: "direct_referrer_commission",
      amountUsdcAtoms: "1500000",
      status: "payable",
      createdAt: "2026-04-23T00:00:00.000Z",
      payableAt: "2026-04-23T00:00:00.000Z",
      approvedAt: null,
      paidAt: null,
      voidedAt: null,
      voidReason: null,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      recipientUserId: "22222222-2222-4222-8222-222222222222",
      sourceTradeAttributionId: "66666666-6666-4666-8666-666666666666",
      rewardType: "trader_cashback",
      amountUsdcAtoms: "500000",
      status: "approved",
      createdAt: "2026-04-24T00:00:00.000Z",
      payableAt: "2026-04-24T00:00:00.000Z",
      approvedAt: "2026-04-25T00:00:00.000Z",
      paidAt: null,
      voidedAt: null,
      voidReason: null,
    },
  ],
  payouts: [
    {
      id: "77777777-7777-4777-8777-777777777777",
      recipientUserId: "22222222-2222-4222-8222-222222222222",
      amountUsdcAtoms: "2000000",
      status: "approved",
      destinationType: "wallet",
      destinationValue: "0x1111111111111111111111111111111111111111",
      payoutChain: "polygon",
      payoutChainId: 137,
      payoutAsset: "pUSD",
      payoutAssetDecimals: 6,
      assetContractAddress: "0x2222222222222222222222222222222222222222",
      reviewedBy: "88888888-8888-4888-8888-888888888888",
      reviewedAt: "2026-04-26T00:00:00.000Z",
      paidAt: null,
      txHash: null,
      notes: null,
      createdAt: "2026-04-25T00:00:00.000Z",
    },
    {
      id: "99999999-9999-4999-8999-999999999999",
      recipientUserId: "22222222-2222-4222-8222-222222222222",
      amountUsdcAtoms: "3000000",
      status: "paid",
      destinationType: "wallet",
      destinationValue: "0x1111111111111111111111111111111111111111",
      payoutChain: "polygon",
      payoutChainId: 137,
      payoutAsset: "pUSD",
      payoutAssetDecimals: 6,
      assetContractAddress: "0x2222222222222222222222222222222222222222",
      reviewedBy: "88888888-8888-4888-8888-888888888888",
      reviewedAt: "2026-04-27T00:00:00.000Z",
      paidAt: "2026-04-28T00:00:00.000Z",
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      notes: null,
      createdAt: "2026-04-27T00:00:00.000Z",
    },
  ],
  ...overrides,
});

const renderRewardsPage = async (payload = dashboardResponse()) => {
  const originalFetch: FetchMock = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

  try {
    return renderToStaticMarkup(await renderRewardsPageView("zh-HK", { kind: "ok", user, dashboard: payload as any }));
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("rewards page renders pending, payable, paid, and in-review cards", async () => {
  const markup = await renderRewardsPage();

  assert.match(markup, /待確認獎勵/);
  assert.match(markup, /可提取獎勵/);
  assert.match(markup, /已支付獎勵/);
  assert.match(markup, /審批中提款/);
});

test("rewards page renders manual approval and Polygon pUSD copy", async () => {
  const markup = await renderRewardsPage();

  assert.match(markup, /實際支付不會自動執行，必須由管理員審批及記錄交易哈希/);
  assert.match(markup, /支付資產為 Polygon pUSD/);
  assert.match(markup, /請確認你的收款地址支援 Polygon 網絡/);
});

test("rewards page presents accounting records instead of trading balance", async () => {
  const markup = await renderRewardsPage();

  assert.match(markup, /獎勵不是交易餘額，不能用作平台內下注或交易/);
  assert.match(markup, /Builder 費用收入/);
  assert.doesNotMatch(markup, /<span class="metric-label">(?:可用交易資金|平台餘額|交易餘額|交易額度)<\/span>/);
});

test("rewards page exposes invalid wallet state", async () => {
  const markup = await renderRewardsPage();

  assert.match(markup, /pattern="\^0x\[a-fA-F0-9\]\{40\}\$"/);
  assert.match(markup, /請輸入有效的 0x EVM 錢包地址/);
});

test("payout request button is disabled when no payable rewards exist", async () => {
  const markup = await renderRewardsPage(dashboardResponse({
    rewards: {
      pendingRewards: "0",
      payableRewards: "0",
      approvedRewards: "0",
      paidRewards: "0",
      voidRewards: "0",
      directReferralCount: 0,
      directTradingVolumeUsdcAtoms: "0",
    },
    rewardLedger: [],
    payouts: [],
  }));

  assert.match(markup, /目前沒有可提取獎勵/);
  assert.match(markup, /<button type="submit" disabled="">提交支付申請<\/button>/);
});

test("forbidden promotional and downline terms are absent from live rewards UI", async () => {
  const markup = await renderRewardsPage();

  for (const term of ["傳銷", "下線收益", "上線收益", "發展下線", "被動收入", "躺賺", "包賺", "保證回報", "MLM", "downline", "passive income", "guaranteed profit"]) {
    assert.doesNotMatch(markup, new RegExp(term));
  }
});
