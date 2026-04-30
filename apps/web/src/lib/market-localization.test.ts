import assert from "node:assert/strict";
import test from "node:test";

import { getOriginalMarketTitle, localizeMarketTitle, localizeOutcomeLabel } from "./market-localization";

test("rule-based World Cup titles localize safely for known entities", () => {
  assert.equal(
    localizeMarketTitle({ title: "Will Morocco win the 2026 FIFA World Cup?" }, "zh-HK"),
    "摩洛哥會否贏得 2026 FIFA 世界盃？",
  );
  assert.equal(
    localizeMarketTitle({ title: "Will Norway win the 2026 FIFA World Cup?" }, "zh-HK"),
    "挪威會否贏得 2026 FIFA 世界盃？",
  );
  assert.equal(
    localizeMarketTitle({ title: "Will Senegal win the 2026 FIFA World Cup?" }, "zh-HK"),
    "塞內加爾會否贏得 2026 FIFA 世界盃？",
  );
});

test("unknown market titles fall back to original source text", () => {
  const title = "Will a brand new unknown thing happen tomorrow?";
  assert.equal(localizeMarketTitle({ title }, "zh-HK"), title);
  assert.equal(getOriginalMarketTitle({ titleLocalized: "本地化", titleOriginal: title, title: "本地化" }), title);
});

test("common outcome labels localize to zh-HK", () => {
  assert.equal(localizeOutcomeLabel("Yes", "zh-HK"), "是");
  assert.equal(localizeOutcomeLabel("No", "zh-HK"), "否");
  assert.equal(localizeOutcomeLabel("YES", "zh-HK"), "是");
  assert.equal(localizeOutcomeLabel("NO", "zh-HK"), "否");
  assert.equal(localizeOutcomeLabel("Up", "zh-HK"), "上升");
  assert.equal(localizeOutcomeLabel("Down", "zh-HK"), "下跌");
  assert.equal(localizeOutcomeLabel("Maybe", "zh-HK"), "Maybe");
});
