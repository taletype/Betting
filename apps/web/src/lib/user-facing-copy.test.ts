import assert from "node:assert/strict";
import test from "node:test";

import { getLocaleCopy } from "./locale";
import { siteCopy } from "./i18n";
import { thirdwebDisclosure } from "../app/thirdweb-wallet-funding-card";

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
  "保證獲利",
  "穩賺",
  "profit guaranteed",
];

const approvedReferralSafetyCopy = "本平台只支援直接推薦獎勵；不設多層或遞延推薦獎勵，亦不承諾固定回報。";

const stripApprovedCopy = (value: string): string =>
  value.replaceAll(approvedReferralSafetyCopy, "");

test("key zh-HK ambassador copy avoids forbidden terms", () => {
  const ambassadorCopy = stripApprovedCopy(JSON.stringify({
    ambassador: getLocaleCopy("zh-HK").ambassador,
    rewards: getLocaleCopy("zh-HK").rewards,
    research: getLocaleCopy("zh-HK").research,
  }));
  for (const term of forbiddenChineseTerms) {
    assert.doesNotMatch(ambassadorCopy, new RegExp(term));
  }
});

test("all locale dictionaries avoid forbidden wording and keep Groq server-only", () => {
  const copy = JSON.stringify(siteCopy);
  for (const term of [
    ...forbiddenChineseTerms,
    "传销",
    "下线收益",
    "上线收益",
    "发展下线",
    "被动收入",
    "躺赚",
    "包赚",
    "保证回报",
    "代客下注",
    "代客交易",
    "入会费",
    "NEXT_PUBLIC_GROQ_API_KEY",
  ]) {
    assert.doesNotMatch(copy, new RegExp(term));
  }
});

test("approved zh-HK referral safety copy is exact", () => {
  const ambassador = getLocaleCopy("zh-HK").ambassador;

  assert.equal(
    ambassador.subtitle,
    "分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。",
  );
  assert.equal(ambassador.approvalNotice, "獎勵計算可自動記錄，但實際支付需要管理員審批。");
  assert.equal(ambassador.safeNotice, approvedReferralSafetyCopy);
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

test("zh-HK product copy avoids legacy external CTA labels", () => {
  const copy = JSON.stringify({
    research: getLocaleCopy("zh-HK").research,
  });

  assert.doesNotMatch(copy, /前往 Polymarket|Open on Polymarket/);
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
    "實盤提交已停用",
    "連接錢包",
    "設定 Polymarket 交易權限",
    "Builder Code 未設定",
    "市場已關閉",
    "價格或數量無效",
    "需要用戶自行簽署訂單",
    "準備自行簽署訂單",
    "已提交到 Polymarket",
  ]) {
    assert.ok(Object.values(readiness).includes(text), text);
  }
  assert.equal(getLocaleCopy("zh-HK").research.tradeViaPolymarket, "透過 Polymarket 交易");
  assert.equal(
    getLocaleCopy("zh-HK").research.nonCustodialNotice,
    "用戶需要自行簽署訂單。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。",
  );
  assert.doesNotMatch(Object.values(readiness).join(" "), /所在地區支援狀態|目前所在地區暫不支援/);
  assert.equal(
    getLocaleCopy("zh-HK").research.routedExecutionNotice,
    "交易會透過 Polymarket 執行。本平台只提供市場資料、下單介面及路由，不持有你的 Polymarket 資金。",
  );
  assert.match(getLocaleCopy("zh-HK").research.feeNotice, /費率只適用於合資格並成功成交的 Polymarket 路由訂單/);
});

test("zh-HK Thirdweb wallet funding copy is non-custodial", () => {
  assert.equal(
    thirdwebDisclosure,
    "資金會進入你的錢包。本平台不會託管你的資金。第三方增值或兌換服務可能收取費用，實際費用會在交易前顯示。單純增值錢包不代表已完成 Polymarket 交易。",
  );
});
