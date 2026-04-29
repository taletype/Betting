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
- The app does not custody Polymarket user funds, place trades for users, pool funds, or mutate internal balances from external Polymarket activity.
- Rewards are accounting records, not a spendable betting balance.
- There is no automatic treasury transfer.
- Referral rewards are direct-referral only. The reward split is platform 60%, direct referrer 30%, trader cashback 10%. If no direct referrer exists, the referrer share goes to platform.
