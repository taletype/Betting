import assert from "node:assert/strict";
import test from "node:test";

import { formatDateTime, getLocaleCopy, getLocaleHref, isSupportedLocale, resolveLocale } from "./locale";

test("locale helpers validate and resolve locales", () => {
  assert.equal(isSupportedLocale("en"), true);
  assert.equal(isSupportedLocale("zh-HK"), true);
  assert.equal(isSupportedLocale("zh-TW"), false);
  assert.equal(resolveLocale("zh-HK"), "zh-HK");
  assert.equal(resolveLocale("unknown"), "zh-HK");
});

test("locale href helper keeps zh-HK default and prefixes english fallback routes", () => {
  assert.equal(getLocaleHref("zh-HK", "/markets"), "/markets");
  assert.equal(getLocaleHref("en", "/markets"), "/en/markets");
  assert.equal(getLocaleHref("en", "/"), "/en");
});

test("locale copy exposes translated labels", () => {
  assert.equal(getLocaleCopy("en").markets.statuses.open, "Active");
  assert.equal(getLocaleCopy("zh-HK").markets.statuses.open, "開放");
});

test("locale copy falls back to English for missing nested keys", () => {
  assert.equal(getLocaleCopy("zh-HK").portfolio.unavailableAction, "-");
});

test("date formatting changes by locale", () => {
  const value = "2026-04-22T12:34:00.000Z";
  const english = formatDateTime("en", value, "UTC");
  const chinese = formatDateTime("zh-HK", value, "UTC");

  assert.notEqual(english, chinese);
  assert.match(english, /Apr|2026/);
  assert.match(chinese, /2026/);
});
