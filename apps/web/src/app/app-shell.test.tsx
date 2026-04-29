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
  assert.match(markup, /href="\/guides"/);
  assert.match(markup, /href="\/ambassador"/);
  assert.match(markup, /href="\/rewards"/);
  assert.match(markup, /href="\/account"/);
  assert.doesNotMatch(markup, /href="\/admin"/);
  assert.doesNotMatch(markup, /href="\/markets"/);
  assert.doesNotMatch(markup, /href="\/portfolio"/);
  assert.doesNotMatch(markup, /href="\/claims"/);
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
