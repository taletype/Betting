import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import LoginPage from "./login/page";
import SignupPage from "./signup/page";

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
