import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AccountPage, { AccountReferralSection } from "./account/page";
import LoginPage from "./login/page";
import SignupPage from "./signup/page";

const withEnv = async (values: Record<string, string | undefined>, run: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("login and signup pages render zh-HK copy", async () => {
  await withEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  }, async () => {
    const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
    const signup = renderToStaticMarkup(await SignupPage());

    assert.match(login, /以電郵連結登入/);
    assert.match(login, /發送登入連結/);
    assert.match(login, /登入後可保存推薦獎勵及帳戶資料。/);
    assert.match(login, /瀏覽市場不需要登入。/);
    assert.match(signup, /註冊/);
    assert.match(signup, /以電郵繼續/);
  });
});

test("login and signup pages display pending referral from query string", async () => {
  const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ ref: "friend001" }) }));
  const signup = renderToStaticMarkup(await SignupPage({ searchParams: Promise.resolve({ ref: "friend001" }) }));

  assert.match(login, /你正在使用推薦碼：FRIEND001/);
  assert.match(login, /登入後會自動嘗試套用此推薦碼。/);
  assert.match(login, /name="ref" value="FRIEND001"/);
  assert.match(signup, /你正在使用推薦碼：FRIEND001/);
  assert.match(signup, /登入後會自動嘗試套用此推薦碼。/);
  assert.match(signup, /name="ref" value="FRIEND001"/);
});

test("login page shows sent and callback failure states safely", async () => {
  await withEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  }, async () => {
    const sent = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ sent: "1", next: "/polymarket", ref: "friend001" }) }));
    const failed = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ auth: "callback_failed", next: "/polymarket" }) }));

    assert.match(sent, /登入連結已發送，請檢查你的電郵。/);
    assert.match(sent, /登入後會返回：\/polymarket/);
    assert.match(sent, /推薦碼會在登入確認後套用：FRIEND001/);
    assert.match(failed, /登入連結已失效或無法確認，請重新發送。/);
    assert.doesNotMatch(failed, /raw provider failure|stack trace|supabase error/i);
  });
});

test("malformed referral code shows safe failure copy", async () => {
  const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ ref: "x" }) }));

  assert.match(login, /推薦碼未能使用/);
  assert.match(login, /推薦碼無效/);
  assert.doesNotMatch(login, /malformed|invalid/i);
});

test("account referral section shows applied attribution and invite actions", () => {
  const account = renderToStaticMarkup(
    React.createElement(AccountReferralSection, {
      dashboard: {
        ambassadorCode: {
          id: "11111111-1111-4111-8111-111111111111",
          code: "OWNER001",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
          status: "active",
          inviteUrl: "http://127.0.0.1:3000/signup?ref=OWNER001",
          createdAt: "2026-04-22T00:00:00.000Z",
          disabledAt: null,
        },
        attribution: {
          id: "33333333-3333-4333-8333-333333333333",
          referredUserId: "22222222-2222-4222-8222-222222222222",
          referrerUserId: "44444444-4444-4444-8444-444444444444",
          ambassadorCode: "FRIEND001",
          attributedAt: "2026-04-22T00:00:00.000Z",
          qualificationStatus: "pending",
          rejectionReason: null,
        },
        directReferrals: [],
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
      },
    }),
  );

  assert.match(account, /推薦來源已保存/);
  assert.match(account, /目前推薦來源/);
  assert.match(account, /FRIEND001/);
  assert.match(account, /你的推薦碼/);
  assert.match(account, /OWNER001/);
  assert.match(account, /複製邀請連結/);
  assert.match(account, /href="\/rewards"/);
});

test("login page does not show auth unavailable when public Supabase config exists", async () => {
  await withEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  }, async () => {
    const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ auth: "unavailable" }) }));

    assert.doesNotMatch(login, /Supabase Auth 未完成設定/);
    assert.match(login, /登入/);
  });
});

test("login page shows auth unavailable only when public Supabase config is missing", async () => {
  await withEnv({
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  }, async () => {
    const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ auth: "unavailable" }) }));

    assert.match(login, /目前登入功能仍在設定中。正式帳戶、推薦歸因、獎勵及支付操作會在 Supabase Auth 啟用後才開放。/);
    assert.match(login, /disabled=""/);
    assert.match(login, /Auth 尚未設定/);
  });
});

test("configured Supabase browser env enables login submit", async () => {
  await withEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  }, async () => {
    const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    assert.match(login, /發送登入連結/);
    assert.doesNotMatch(login, /Auth 尚未設定/);
    assert.doesNotMatch(login, /disabled=""/);
  });
});

test("signup page disables magic link submit when Supabase browser env is missing", async () => {
  await withEnv({
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  }, async () => {
    const signup = renderToStaticMarkup(await SignupPage({ searchParams: Promise.resolve({ ref: "friend001" }) }));

    assert.match(signup, /你正在使用推薦碼：FRIEND001/);
    assert.match(signup, /Auth 尚未設定/);
    assert.match(signup, /disabled=""/);
  });
});

test("account page renders a login CTA instead of account state when unauthenticated", async () => {
  await withEnv({
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  }, async () => {
    const account = renderToStaticMarkup(await AccountPage());

    assert.match(account, /帳戶/);
    assert.match(account, /登入/);
    assert.doesNotMatch(account, /User ID/);
  });
});

test("frontend Supabase browser client does not import service-role admin code", () => {
  const clientSource = readFileSync(resolve("src/lib/supabase/client.ts"), "utf8");
  const packageSource = readFileSync(resolve("../../packages/supabase/src/client/browser.ts"), "utf8");
  const loginSource = readFileSync(resolve("src/app/login/page.tsx"), "utf8");
  const signupSource = readFileSync(resolve("src/app/signup/page.tsx"), "utf8");

  assert.doesNotMatch(clientSource, /@bet\/supabase["']/);
  assert.doesNotMatch(clientSource, /admin|service|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(packageSource, /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/);
  assert.doesNotMatch(loginSource, /SUPABASE_SERVICE_ROLE_KEY|@bet\/supabase\/admin|createSupabaseAdminClient/);
  assert.doesNotMatch(signupSource, /SUPABASE_SERVICE_ROLE_KEY|@bet\/supabase\/admin|createSupabaseAdminClient/);
  assert.match(packageSource, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(packageSource, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});
