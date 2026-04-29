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

test("zh-HK rewards copy explains auto request and manual Polygon pUSD payout", () => {
  const rewards = getLocaleCopy("zh-HK").rewards;

  assert.equal(
    rewards.autoCalculationNotice,
    "獎勵計算可自動記錄，但實際支付需要管理員審批。",
  );
  assert.equal(rewards.adminApprovalNotice, "實際支付不會自動執行，必須由管理員審批及記錄交易哈希。");
  assert.match(rewards.polygonPusdNotice, /Polygon 上的 pUSD/);
  assert.match(rewards.polygonPusdNotice, /請確認你的收款地址支援 Polygon 網絡/);
});

test("key zh-HK product copy does not expose Sepolia or testnet wording", () => {
  const copy = JSON.stringify({
    shell: getLocaleCopy("zh-HK").shell,
    wallet: getLocaleCopy("zh-HK").wallet,
    research: getLocaleCopy("zh-HK").research,
    portfolio: getLocaleCopy("zh-HK").portfolio,
  });

  assert.doesNotMatch(copy, /Sepolia|測試網|testnet/i);
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

test("zh-HK Polymarket live trading readiness copy exposes every explicit state", () => {
  const readiness = getLocaleCopy("zh-HK").research.readinessCopy;
  for (const text of [
    "交易功能尚未啟用",
    "尚未連接錢包",
    "需要 Polymarket 憑證",
    "Builder Code 未設定",
    "市場暫時不可交易",
    "你目前所在地區暫不支援 Polymarket 下單",
    "價格或數量無效",
    "提交器暫時不可用",
    "需要用戶自行簽署訂單",
    "透過 Polymarket 交易",
    "已提交到 Polymarket",
  ]) {
    assert.ok(Object.values(readiness).includes(text), text);
  }
  assert.equal(
    getLocaleCopy("zh-HK").research.nonCustodialNotice,
    "用戶需要自行簽署訂單。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。",
  );
  assert.equal(
    getLocaleCopy("zh-HK").research.routedExecutionNotice,
    "交易會透過 Polymarket 執行。本平台只提供市場資料、下單介面及路由，不持有你的 Polymarket 資金。",
  );
  assert.match(getLocaleCopy("zh-HK").research.feeNotice, /費率只適用於合資格並成功成交的 Polymarket 路由訂單/);
});
