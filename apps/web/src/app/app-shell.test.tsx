import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppShell } from "./app-shell";

const countText = (markup: string, text: string): number =>
  (markup.match(new RegExp(`>${text}<`, "g")) ?? []).length;

test("app shell points the public nav at the Polymarket funnel", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK">
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /Polymarket 市場/);
  assert.match(markup, /首頁/);
  assert.match(markup, /邀請朋友/);
  assert.match(markup, /指南/);
  assert.match(markup, /href="\/"/);
  assert.match(markup, /href="\/polymarket"/);
  assert.match(markup, /href="\/ambassador"/);
  assert.match(markup, /href="\/rewards"/);
  assert.match(markup, /href="\/guides"/);
  assert.match(markup, /href="\/login"/);
  assert.match(markup, /本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。/);
  assert.match(markup, /獎勵計算可自動記錄，但實際支付需要管理員審批。/);
  assert.doesNotMatch(markup, /href="\/admin"/);
  assert.doesNotMatch(markup, /href="\/markets"/);
  assert.doesNotMatch(markup, /href="\/portfolio"/);
  assert.doesNotMatch(markup, /href="\/claims"/);
  assert.doesNotMatch(markup, /external-markets/);
});

test("signed-out app shell shows login and no duplicate account item", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK">
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /class="auth-state-button" href="\/login"/);
  assert.equal(countText(markup, "登入"), 1);
  assert.equal(countText(markup, "帳戶"), 0);
});

test("signed-in app shell shows account and logout items", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK" authenticated>
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /class="auth-state-button" href="\/account"/);
  assert.match(markup, />登出<\/button>/);
  assert.doesNotMatch(markup, /class="auth-state-button" href="\/login"/);
  assert.equal(countText(markup, "帳戶"), 1);
  assert.equal(countText(markup, "登出"), 1);
});

test("app shell shows admin only when allowed", () => {
  const nonAdminMarkup = renderToStaticMarkup(
    <AppShell locale="zh-HK">
      <main>content</main>
    </AppShell>,
  );
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK" showAdmin>
      <main>content</main>
    </AppShell>,
  );

  assert.doesNotMatch(nonAdminMarkup, /href="\/admin"/);
  assert.doesNotMatch(nonAdminMarkup, />管理員</);
  assert.match(markup, /href="\/admin"/);
  assert.match(markup, />管理員</);
});
