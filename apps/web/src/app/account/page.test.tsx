import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { renderAccountPage } from "./page";

const user = { id: "user-real-123", email: "real.user@example.com" };

const dashboard = {
  ambassadorCode: { id: "1", code: "HKREF001", ownerUserId: "u", status: "active" as const, inviteUrl: "https://example/ambassador?ref=HKREF001", createdAt: "2026-01-01", disabledAt: null },
  attribution: null,
  directReferrals: [],
  rewards: { pendingRewards: "100", payableRewards: "200", approvedRewards: "0", paidRewards: "0", voidRewards: "0", directReferralCount: 1, directTradingVolumeUsdcAtoms: "0" },
  rewardLedger: [],
  payouts: [],
};

test("account signed-out shows login CTA", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "signed_out" }));
  assert.match(markup, /請先登入以查看此頁面/);
  assert.doesNotMatch(markup, /User ID/);
  assert.doesNotMatch(markup, /user-real-123/);
  assert.doesNotMatch(markup, /real\.user@example\.com/);
});

test("account signed-in + dashboard OK shows referral code and real user details", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "ok", user, dashboard }));
  assert.match(markup, /HKREF001/);
  assert.match(markup, /user-real-123/);
  assert.match(markup, /real\.user@example\.com/);
  assert.match(markup, /錢包驗證/);
  assert.doesNotMatch(markup, /待驗證（請於下方連接）/);
  assert.doesNotMatch(markup, /請查看下方「增值錢包」卡片狀態/);
});

test("account signed-in + dashboard 401 shows expired-session copy", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "expired_session", user, status: 401 }));
  assert.match(markup, /登入狀態已過期，請重新登入。/);
});

test("account signed-in + dashboard 500 shows unavailable copy and real user details", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({ kind: "unavailable", user, status: 500, code: "x", source: "same-site API" }));
  assert.match(markup, /已登入，但推薦資料暫時未能載入。請重新整理或稍後再試。/);
  assert.match(markup, /獎勵摘要暫時未能載入/);
  assert.match(markup, /user-real-123/);
  assert.match(markup, /real\.user@example\.com/);
  assert.doesNotMatch(markup, /登入後可在此查看你的推薦碼及邀請連結/);
  assert.doesNotMatch(markup, /登入後可查看推薦、獎勵及支付申請狀態/);
});

test("account unavailable diagnostics do not render secret-bearing values", async () => {
  const markup = renderToStaticMarkup(await renderAccountPage({
    kind: "unavailable",
    user,
    status: 500,
    code: "SUPABASE_SERVICE_ROLE_KEY leaked",
    source: "Bearer token from cookie auth header",
    message: "private key secret",
  }));
  assert.doesNotMatch(markup, /SUPABASE_SERVICE_ROLE_KEY|Bearer token|cookie auth header|private key secret/i);
});
