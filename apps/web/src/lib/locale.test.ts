import assert from "node:assert/strict";
import test from "node:test";

import { formatDateTime, getLocaleCopy, getLocaleHref, isSupportedLocale, resolveLocale } from "./locale";

test("locale helpers validate and resolve locales", () => {
  assert.equal(isSupportedLocale("en"), true);
  assert.equal(isSupportedLocale("zh-CN"), true);
  assert.equal(isSupportedLocale("zh-TW"), false);
  assert.equal(resolveLocale("zh-CN"), "zh-CN");
  assert.equal(resolveLocale("unknown"), "en");
});

test("locale href helper preserves default and prefixes chinese routes", () => {
  assert.equal(getLocaleHref("en", "/markets"), "/markets");
  assert.equal(getLocaleHref("zh-CN", "/markets"), "/zh-CN/markets");
  assert.equal(getLocaleHref("zh-CN", "/"), "/zh-CN");
});

test("locale copy exposes translated labels", () => {
  assert.equal(getLocaleCopy("en").markets.statuses.open, "Active");
  assert.equal(getLocaleCopy("zh-CN").markets.statuses.open, "活跃");
});

test("date formatting changes by locale", () => {
  const value = "2026-04-22T12:34:00.000Z";
  const english = formatDateTime("en", value, "UTC");
  const chinese = formatDateTime("zh-CN", value, "UTC");

  assert.notEqual(english, chinese);
  assert.match(english, /Apr|2026/);
  assert.match(chinese, /2026/);
});
