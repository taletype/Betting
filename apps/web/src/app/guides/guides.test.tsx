import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import GuidesIndexPage from "./page";
import FeesAndBuilderCodeGuide from "./fees-and-builder-code/page";
import HowPolymarketRoutingWorksGuide from "./how-polymarket-routing-works/page";
import InviteRewardsGuide from "./invite-rewards/page";
import PolygonPusdPayoutsGuide from "./polygon-pusd-payouts/page";

test("guide pages render required zh-HK Polymarket Builder reward copy", () => {
  const markup = [
    renderToStaticMarkup(<GuidesIndexPage />),
    renderToStaticMarkup(<HowPolymarketRoutingWorksGuide />),
    renderToStaticMarkup(<InviteRewardsGuide />),
    renderToStaticMarkup(<PolygonPusdPayoutsGuide />),
    renderToStaticMarkup(<FeesAndBuilderCodeGuide />),
  ].join("\n");

  assert.match(markup, /指南/);
  assert.match(markup, /用戶需要自行簽署訂單。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。/);
  assert.match(markup, /待生效 Maker 費率：0.5%/);
  assert.match(markup, /待生效 Taker 費率：1%/);
  assert.match(markup, /費率只適用於合資格並成功成交的 Polymarket 路由訂單。單純瀏覽市場不會產生 Builder 費用。/);
  assert.match(markup, /當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。/);
  assert.match(markup, /獎勵以人手審批方式處理。審批通過後，平台可透過 Polygon 上的 pUSD 向指定錢包支付獎勵。/);
  assert.match(markup, /實際支付不會自動執行，必須由管理員審批及記錄交易哈希。/);
  assert.match(markup, /請確認你的收款地址支援 Polygon 網絡。/);
});
