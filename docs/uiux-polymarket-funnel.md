# Polymarket Funnel UI/UX

The product is Chinese-first, with zh-HK Traditional Chinese as the default user-facing language and English as fallback.

Canonical public flow:

1. Friend shares a referral link.
2. User lands on `/`.
3. User browses public Polymarket market data on `/polymarket`.
4. User signs up or connects a wallet.
5. Routed trading remains disabled until user-owned signing, L2 credential handling, submitter health, and operations review are production-safe.
6. When enabled, the user signs their own order and the app attaches `POLY_BUILDER_CODE`.
7. Confirmed Builder-fee revenue creates direct-referral reward accounting.
8. Polygon pUSD payout remains manual and admin-approved.

UI guardrails:

- Public market browsing must work without login and without `POLY_BUILDER_CODE`.
- Use official/public Polymarket APIs or existing external market tables only. Do not scrape Polymarket.
- `/external/markets` should return real persisted Polymarket rows when present, otherwise public Gamma fallback data. Orderbook and trades panels must not break the page when unavailable.
- The app does not custody Polymarket user funds, place trades for users, pool funds, or mutate internal balances from external Polymarket activity.
- The trade ticket must clearly distinguish visible route UI from actual order submission.
- Rewards are accounting records, not a spendable betting balance.
- There is no automatic treasury transfer.
- Referral rewards are direct-referral only. The reward split is platform 60%, direct referrer 30%, trader cashback 10%. If no direct referrer exists, the referrer share goes to platform.

Visual direction:

- Dark-first premium fintech surface.
- Mobile-first feed with dense market cards, pill filters, status badges, loading shimmer, and sticky mobile trade CTA.
- zh-HK Traditional Chinese is the default user-facing language.

Chart rules:

- Market cards use compact sparklines only when recent imported public trade ticks exist.
- Market detail charts use `history`, `orderbook`, `trades`, and `stats` public read endpoints.
- Do not synthesize production price history, volume, liquidity, orderbook depth, or trade ticks.
- Safe empty chart states are part of the product, not an error.
- Referral and reward charts are accounting dashboards; they must not look like a spendable trading balance.

Core component names:

- `PolymarketMarketCard` pattern for feed cards.
- `MarketSparkline`, `PriceHistoryChart`, `VolumeHistoryChart`, `LiquidityHistoryChart`, `OrderBookDepthChart`, `ReferralFunnelChart`, `RewardSplitChart`, `PayoutStatusChart`.
- `PolymarketTradeTicket` keeps `實際訂單提交` explicit and disabled by default.
