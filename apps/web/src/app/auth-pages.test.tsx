import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import AccountPage from "./account/page";
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
  const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
  const signup = renderToStaticMarkup(await SignupPage());

  assert.match(login, /登入/);
  assert.match(login, /發送登入連結/);
  assert.match(signup, /註冊/);
  assert.match(signup, /以電郵繼續/);
});

test("login and signup pages display pending referral from query string", async () => {
  const login = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ ref: "friend001" }) }));
  const signup = renderToStaticMarkup(await SignupPage({ searchParams: Promise.resolve({ ref: "friend001" }) }));

  assert.match(login, /你正在使用推薦碼：FRIEND001/);
  assert.match(signup, /你正在使用推薦碼：FRIEND001/);
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

    assert.match(login, /Supabase Auth 未完成設定/);
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

  assert.doesNotMatch(clientSource, /@bet\/supabase["']/);
  assert.doesNotMatch(clientSource, /admin|service|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(packageSource, /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/);
  assert.match(packageSource, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(packageSource, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});
