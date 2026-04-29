# Builder Fee Rate Disclosure

This document defines the disclosure language for the Polymarket Builder fee model.

## Current Disclosure Values

- `NEXT_PUBLIC_BUILDER_MAKER_FEE_BPS=50`
- `NEXT_PUBLIC_BUILDER_TAKER_FEE_BPS=100`
- `NEXT_PUBLIC_BUILDER_FEE_STATUS=pending`
- Optional server equivalents:
  - `BUILDER_MAKER_FEE_BPS=50`
  - `BUILDER_TAKER_FEE_BPS=100`
  - `BUILDER_FEE_STATUS=pending`

These values are for user disclosure only. Do not use them to calculate actual Polymarket fees unless validated from Polymarket.

## Required Public Language

- Pending Builder maker fee: 0.5% / 50 bps.
- Pending Builder taker fee: 1.0% / 100 bps.
- Until live confirmation, mark both rates as pending / 待生效.
- Builder fees apply only to eligible matched routed Polymarket orders where our builderCode is attached.
- If builderCode is missing, no Builder-fee attribution occurs.
- Builder fees are additive to Polymarket/platform fees.
- Fees are not charged just for browsing markets.

Approved zh-HK snippets:

> 待生效 Maker 費率：0.5%

> 待生效 Taker 費率：1%

> 費率只適用於合資格並成功成交的 Polymarket 路由訂單。單純瀏覽市場不會產生 Builder 費用。

## Operational Boundaries

- Builder fees accrue to the wallet tied to the Builder profile.
- Rewards are calculated from confirmed Builder-fee revenue.
- Payout rail is Polygon pUSD.
- Payouts remain manual/admin-approved.
- There is no automatic treasury transfer.
- There is no custody and no mutation of internal balances from external Polymarket activity.
- The platform does not trade for users.
- There are no recursive reward levels.
