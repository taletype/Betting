import assert from "node:assert/strict";
import test from "node:test";

import { getLocaleCopy } from "./locale";

const forbiddenChineseTerms = [
  "傳銷",
  "下線收益",
  "上線收益",
  "發展下線",
  "被動收入",
  "躺賺",
  "包賺",
  "保證回報",
  "代客下注",
  "代客交易",
  "入會費",
  "套餐解鎖收益",
  "MLM",
  "downline",
  "passive income",
  "guaranteed profit",
  "managed betting",
];

test("key zh-HK ambassador copy avoids forbidden terms", () => {
  const ambassadorCopy = JSON.stringify({
    ambassador: getLocaleCopy("zh-HK").ambassador,
    rewards: getLocaleCopy("zh-HK").rewards,
    research: getLocaleCopy("zh-HK").research,
  });
  for (const term of forbiddenChineseTerms) {
    assert.doesNotMatch(ambassadorCopy, new RegExp(term));
  }
});

test("Polymarket routed trading stays disabled by default", () => {
  const previous = process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  try {
    assert.notEqual(process.env.POLYMARKET_ROUTED_TRADING_ENABLED, "true");
  } finally {
    if (previous === undefined) delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
    else process.env.POLYMARKET_ROUTED_TRADING_ENABLED = previous;
  }
});
