import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { renderAmbassadorPage } from "./page";

const user = { id: "user-real-123", email: "real.user@example.com" };

const dashboard: any = {
  ambassadorCode: { id: "1", code: "HKREF001", ownerUserId: "u", status: "active", inviteUrl: "https://bet.example/ambassador?ref=HKREF001", createdAt: "2026-05-01T00:00:00.000Z", disabledAt: null },
  attribution: null,
  directReferrals: [],
  rewards: { pendingRewards: "1200000", payableRewards: "3400000", approvedRewards: "0", paidRewards: "5600000", voidRewards: "0", directReferralCount: 3, directTradingVolumeUsdcAtoms: "0" },
  rewardLedger: [],
  payouts: [],
};

test("ambassador ok state shows referral dashboard", async () => {
  const markup = renderToStaticMarkup(await renderAmbassadorPage("zh-HK", { dashboardState: { kind: "ok", user, dashboard } }));
  assert.match(markup, /HKREF001/);
});

test("ambassador signed_out shows login/signup", async () => {
  const markup = renderToStaticMarkup(await renderAmbassadorPage("zh-HK", { dashboardState: { kind: "signed_out" } }));
  assert.match(markup, /登入/);
  assert.match(markup, /註冊/);
});

test("ambassador expired_session shows relogin", async () => {
  const markup = renderToStaticMarkup(await renderAmbassadorPage("zh-HK", { dashboardState: { kind: "expired_session", user, status: 401 } }));
  assert.match(markup, /登入狀態已過期，請重新登入。/);
});

test("ambassador unavailable shows retry not signed-out CTA", async () => {
  const markup = renderToStaticMarkup(await renderAmbassadorPage("zh-HK", { dashboardState: { kind: "unavailable", user, status: 500, code: "ambassador_tables_missing", source: "same-site API" } }));
  assert.match(markup, /已登入，但推薦資料暫時未能載入。/);
  assert.doesNotMatch(markup, /請先登入以查看此頁面。/);
});
