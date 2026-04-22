import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppShell } from "./app-shell";

test("app shell localizes nav links and keeps chinese paths prefixed", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-CN">
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /市场/);
  assert.match(markup, /资产/);
  assert.match(markup, /href="\/zh-CN\/markets"/);
  assert.match(markup, /href="\/zh-CN\/portfolio"/);
});
