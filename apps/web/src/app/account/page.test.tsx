import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { renderAccountPage } from "./page";

const dashboard = {
  ambassadorCode: { id: "1", code: "HKREF001", ownerUserId: "u", status: "active", inviteUrl: "https://example/ambassador?ref=HKREF001", createdAt: "2026-01-01", disabledAt: null },
  attribution: null,
  directReferrals: [],
  rewards: { pendingRewards: "100", payableRewards: "200", approvedRewards: "0", paidRewards: "0", voidRewards: "0", directReferralCount: 1, directTradingVolumeUsdcAtoms: "0" },
  rewardLedger: [],
  payouts: [],
};

test("account signed-out shows login CTA", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "signed_out" }));
  assert.match(markup, /請先登入以繼續/);
});

test("account signed-in + dashboard OK shows referral code", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "ok", dashboard } as never));
  assert.match(markup, /HKREF001/);
});

test("account signed-in + dashboard 401 shows expired-session copy", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "expired_session", status: 401 }));
  assert.match(markup, /登入狀態已過期，請重新登入。/);
});

test("account signed-in + dashboard 500 shows unavailable copy", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "unavailable", status: 500, code: "x", source: "same-site API" }));
  assert.match(markup, /推薦碼暫時未能載入/);
  assert.match(markup, /獎勵摘要暫時未能載入/);
  assert.doesNotMatch(markup, /登入後可在此查看你的推薦碼及邀請連結/);
  assert.doesNotMatch(markup, /登入後可查看推薦、獎勵及支付申請狀態/);
});
