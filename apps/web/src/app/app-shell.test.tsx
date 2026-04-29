import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppShell } from "./app-shell";

test("app shell localizes nav links and keeps zh-HK on default paths", () => {
  const markup = renderToStaticMarkup(
    <AppShell locale="zh-HK">
      <main>content</main>
    </AppShell>,
  );

  assert.match(markup, /市場/);
  assert.match(markup, /資產/);
  assert.match(markup, /href="\/markets"/);
  assert.match(markup, /href="\/portfolio"/);
  assert.match(markup, /href="\/polymarket"/);
  assert.doesNotMatch(markup, /external-markets/);
});
