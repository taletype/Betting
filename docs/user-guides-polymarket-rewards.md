# User Guide Content: Polymarket Builder Rewards

This document mirrors the public guide pages and gives support/admin teams the approved user-facing language.

## Polymarket Routing

Users browse public Polymarket markets on our site. When trading is enabled, users connect their own wallet and Polymarket credentials, review the order, and sign it themselves.

Approved zh-HK copy:

> 用戶需要自行簽署訂單。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。

The app attaches `POLY_BUILDER_CODE` before submission only after the readiness flow is complete. Trading remains disabled unless readiness is complete.

## Fees And Builder Code

Approved zh-HK copy:

> 待生效 Maker 費率：0.5%

> 待生效 Taker 費率：1%

> 費率只適用於合資格並成功成交的 Polymarket 路由訂單。單純瀏覽市場不會產生 Builder 費用。

Additional support notes:

- Builder fees apply only when builderCode is attached and an eligible routed order matches.
- If builderCode is missing, no Builder-fee attribution occurs.
- Builder fees are additive to Polymarket/platform fees.
- These values are disclosure-only until validated against Polymarket settings.

## Invite Rewards

Approved zh-HK copy:

> 當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。

Use this policy language:

- A friend shares a referral link.
- A new user opens the site with `?ref=CODE`.
- First valid referral attribution wins.
- Self-referral is rejected.
- Disabled codes are rejected.
- Rewards are direct-referral only.
- Rewards are calculated from confirmed Builder-fee revenue.
- The platform charges no participation fee, provides no multi-level rewards, does not guarantee profit, and does not place bets or trades for users.

Reward split:

- Platform: 60%.
- Direct referrer: 30%.
- Trader cashback: 10%.
- If no direct referrer exists, the referrer share goes to platform.

## Polygon pUSD Payouts

Approved zh-HK copy:

> 獎勵以人手審批方式處理。審批通過後，平台可透過 Polygon 上的 pUSD 向指定錢包支付獎勵。

> 實際支付不會自動執行，必須由管理員審批及記錄交易哈希。

> 請確認你的收款地址支援 Polygon 網絡。

Status flow:

- `pending`: reward ledger entry recorded.
- `payable`: confirmed Builder-fee revenue made reward payable.
- `requested`: user requested payout review.
- `approved`: admin approved manual payout.
- `paid`: admin recorded Polygon pUSD payment transaction hash.
- `failed`: admin marked payout failed.
- `cancelled`: admin cancelled the request.

There is no automatic treasury transfer.
