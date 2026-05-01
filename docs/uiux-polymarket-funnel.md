# Polymarket Funnel UI/UX

The product is Chinese-first, with zh-HK Traditional Chinese as the default user-facing language and English as fallback.

Canonical public flow:

1. Friend opens `/ambassador` and copies an invite link.
2. New user lands on `/?ref=CODE` or `/polymarket?ref=CODE`.
3. The pending referral banner shows `你正在使用推薦碼：CODE`.
4. User browses public Polymarket market data on `/polymarket`.
5. User opens `/polymarket/[slug]`.
6. User clicks the internal `透過 Polymarket 交易` CTA.
7. The trade ticket resolves in this order: `連接錢包`, `增值錢包`, `設定 Polymarket 交易權限`, `市場只供瀏覽`, `實盤提交已停用`, `準備自行簽署訂單`.
8. Login remains secondary and is used only to save referral/reward state.
9. Routed trading remains disabled until user-owned signing, L2 credential handling, submitter health, and operations review are production-safe.
10. When enabled, the user signs their own order and the app attaches `POLY_BUILDER_CODE`.
11. Confirmed Builder-fee revenue creates direct-referral reward accounting.
12. Polygon pUSD payout remains manual and admin-approved.

UI guardrails:

- Public market browsing must work without login and without `POLY_BUILDER_CODE`.
- Public user CTAs must not say `前往 Polymarket` or `Open on Polymarket`; source/provenance may say `來源：Polymarket` or `資料來源：Polymarket API`.
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
- Home/feed/detail chart components are `MarketSparkline`, `MiniMetricTrend`, `PriceHistoryChart`, `VolumeHistoryChart`, `LiquidityHistoryChart`, `OrderBookDepthChart`, and `RecentTradesChart`.
- Ambassador/reward/admin accounting chart components are `ReferralFunnelChart`, `RewardSplitChart`, and `PayoutStatusChart`.
- Do not synthesize production price history, volume, liquidity, orderbook depth, or trade ticks.
- Do not use `Math.random()` or hardcoded fake chart arrays in production pages.
- Safe empty chart states are part of the product, not an error.
- Stale market stats must be labelled with `資料可能不是最新`.
- Referral and reward charts are accounting dashboards; they must not look like a spendable trading balance.

Core component names:

- `PolymarketMarketCard` pattern for feed cards.
- `MarketSparkline`, `MiniMetricTrend`, `PriceHistoryChart`, `VolumeHistoryChart`, `LiquidityHistoryChart`, `OrderBookDepthChart`, `RecentTradesChart`, `ReferralFunnelChart`, `RewardSplitChart`, `PayoutStatusChart`.
- `PolymarketTradeTicket` keeps `實際訂單提交` explicit and disabled by default.

Mobile QA expectations:

- Market-card sparklines must fit inside 390px cards without horizontal page overflow.
- Detail charts stack into one column on mobile.
- Tables may scroll inside their own panel; they must not widen the whole viewport.
- The mobile trade sheet sits above bottom navigation and page padding must leave chart/table content reachable behind it.
