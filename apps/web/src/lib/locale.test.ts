import assert from "node:assert/strict";
import test from "node:test";

import { formatDateTime, getLocaleCopy, getLocaleHref, isSupportedLocale, localeToDisplayName, localeToHtmlLang, normalizeLocale, resolveLocale } from "./locale";

test("locale helpers validate and resolve locales", () => {
  assert.equal(isSupportedLocale("en"), true);
  assert.equal(isSupportedLocale("zh-HK"), true);
  assert.equal(isSupportedLocale("zh-TW"), true);
  assert.equal(isSupportedLocale("zh-CN"), true);
  assert.equal(resolveLocale("zh-HK"), "zh-HK");
  assert.equal(normalizeLocale("zh-cn"), "zh-CN");
  assert.equal(localeToHtmlLang("zh-TW"), "zh-TW");
  assert.equal(localeToDisplayName("zh-CN"), "简中");
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
  assert.equal(
    getLocaleCopy("zh-HK").research.loadErrorDetails.configured_api_base_unreachable,
    "正式環境的 API_BASE_URL / NEXT_PUBLIC_API_BASE_URL 指向不可連線地址。請檢查 Vercel 環境變數。",
  );
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
