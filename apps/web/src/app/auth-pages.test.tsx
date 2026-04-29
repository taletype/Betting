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
