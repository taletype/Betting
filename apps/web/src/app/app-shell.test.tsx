import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppShell } from "./app-shell";

test("app shell points the public nav at the Polymarket funnel", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK">
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /Polymarket 市場/);
  assert.match(markup, /首頁/);
  assert.match(markup, /邀請朋友/);
  assert.match(markup, /href="\/"/);
  assert.match(markup, /href="\/polymarket"/);
  assert.match(markup, /href="\/ambassador"/);
  assert.match(markup, /href="\/rewards"/);
  assert.match(markup, /href="\/account"/);
  assert.match(markup, /href="\/login"/);
  assert.match(markup, /非託管/);
  assert.match(markup, /支付需人手審批/);
  assert.doesNotMatch(markup, /href="\/admin"/);
  assert.doesNotMatch(markup, /href="\/markets"/);
  assert.doesNotMatch(markup, /href="\/portfolio"/);
  assert.doesNotMatch(markup, /href="\/claims"/);
  assert.doesNotMatch(markup, /href="\/guides"/);
  assert.doesNotMatch(markup, /external-markets/);
});

test("app shell shows admin only when allowed", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK" showAdmin>
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /href="\/admin"/);
  assert.match(markup, /管理/);
});

test("app shell auth state button points to account after login", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK" authenticated>
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /class="auth-state-button" href="\/account"/);
  assert.doesNotMatch(markup, /class="auth-state-button" href="\/login"/);
});
