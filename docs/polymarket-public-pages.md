# Polymarket Public Pages

Public pages:

- `/` is the Chinese-first landing page.
- `/polymarket` is the primary Polymarket market feed.
- `/polymarket/[slug]` is the market detail page.
- `/external-markets` remains a compatibility redirect to `/polymarket`.
- `/ambassador`, `/rewards`, `/guides`, and admin review pages support the referral and Builder-fee disclosure funnel.

Public API map:

- `GET /external/markets` returns safe public Polymarket market records for browsing.
- `GET /external/markets/:source/:externalId` returns one safe public market by source plus external ID or slug.
- `GET /external/markets/:source/:externalId/orderbook` returns latest captured orderbook snapshots, or `{ orderbook: [] }`.
- `GET /external/markets/:source/:externalId/trades` returns imported recent ticks, or `{ trades: [] }`.
- `GET /external/markets/:source/:externalId/history` returns chart-safe points derived from imported public trade ticks, or `{ history: [] }`.
- `GET /external/markets/:source/:externalId/stats` returns volume/liquidity/spread/freshness metadata.

Market data rules:

- Do not scrape Polymarket.
- Use existing external market tables first when available.
- If no usable persisted Polymarket data exists, use the official/public Gamma API fallback for discovery.
- CLOB/orderbook/trade reads are optional and must degrade to safe empty states.
- Price, volume, liquidity, depth, and recent-trade charts must use only persisted public sync data or official/public Polymarket API responses. If history is unavailable, show empty chart copy instead of demo data.
- Missing `POLY_BUILDER_CODE` must not break browsing.
- Market browsing is read-only and available without login.

Chart surfaces:

- `/` shows trending market sparklines when recent imported ticks exist.
- `/polymarket` shows market-card sparklines, `MiniMetricTrend` volume/liquidity metrics, and close-state progress.
- `/polymarket/[slug]` shows `PriceHistoryChart`, `VolumeHistoryChart`, `LiquidityHistoryChart`, `OrderBookDepthChart`, and `RecentTradesChart`.
- `/ambassador`, `/rewards`, and admin pages show `ReferralFunnelChart`, `RewardSplitChart`, and `PayoutStatusChart` from internal referral accounting records only.
- Missing history/orderbook/trades render zh-HK empty states: `暫時未有圖表資料`, `市場走勢資料暫時未能更新`, `訂單簿資料暫時未有`, or `成交資料暫時未有`.
- Production pages must not use random demo chart data or hardcoded fake price history. Test fixtures may exist only in tests/stories and must stay isolated from runtime pages.

Trading boundary:

- `POLYMARKET_ROUTED_TRADING_ENABLED=false` by default.
- Live routed trading must stay disabled unless user-owned signing, L2 credentials, and submitter flow are production-safe.
- Users sign their own orders. The platform does not custody Polymarket funds and does not place trades for users.
- External Polymarket activity must not mutate internal trading ledgers or balances.
- The trade ticket is a readiness shell. Actual order submission remains disabled unless every user-signing, L2 credential, submitter, Builder Code, and operational gate is production-safe.

Reward and payout boundary:

- Rewards are accounting records only and must not be presented as trading balance.
- Pending/payable/paid states must remain visible in zh-HK copy.
- Polygon pUSD payout copy must state that payouts are manual and admin-approved.
- No automatic treasury transfer is enabled by public pages, reward pages, payout pages, or chart endpoints.

Builder disclosure:

- Pending Maker Builder fee disclosure: 0.5%.
- Pending Taker Builder fee disclosure: 1%.
- Disclosure values are not authoritative settlement values; settlement must come from confirmed Polymarket Builder revenue.
- Builder Code attribution only applies to eligible, matched routed Polymarket orders. Browsing never creates Builder fees.
