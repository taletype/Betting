# Current Product Direction

This app is a zh-HK first Polymarket market portal with referral/invite acquisition, safe Builder Code attribution, direct-referral reward accounting, and manual/admin-approved payouts.

## Canonical Funnel

1. Friend shares invite link.
2. User lands on the site.
3. User browses public Polymarket markets.
4. User signs up or connects a wallet.
5. When enabled, user trades through a non-custodial Polymarket-routed flow.
6. User signs their own order.
7. App attaches `POLY_BUILDER_CODE` immediately before routed submission.
8. Confirmed Builder-fee revenue can create direct-referral rewards.
9. Payout remains manual and admin-approved.

## Live Surfaces

- `/` redirects into the market experience.
- `/polymarket` is the canonical public Polymarket market portal.
- `/polymarket/[slug]` is reserved for external market deep links and redirects into the portal.
- `/ambassador`, `/rewards`, `/account`, and valid `/admin/*` pages remain part of the referral/reward/admin workflow.
- Public market browsing must work without `POLY_BUILDER_CODE`.

## Disabled By Default

- Polymarket routed trading is scaffolded only and defaults off with `POLYMARKET_ROUTED_TRADING_ENABLED=false`.
- Automatic ambassador payouts are disabled with `AMBASSADOR_AUTO_PAYOUT_ENABLED=false`.
- No live Polymarket routed trading is enabled by this cleanup pass.
- No automatic production payout transfer is enabled by this cleanup pass.

## Production Chain

- Production internal chain support is Base only.
- Production uses `BASE_CHAIN_ID=8453`, `BASE_RPC_URL`, `BASE_USDC_ADDRESS`, and `BASE_TREASURY_ADDRESS`.
- Base Sepolia (`84532`) is retained only for staging/smoke/dev evidence paths.
- Generic Ethereum Sepolia (`11155111`, `SEPOLIA_RPC_URL`, `ETHEREUM_SEPOLIA`) is not part of the product or production config.

## Boundaries

- The app uses public Polymarket APIs for browsing/sync; scraping is not a product dependency.
- Polymarket routed trading must remain non-custodial and user-signed.
- The platform must not custody Polymarket funds or place trades for users.
- Referral rewards are direct-referral only.
- No MLM, downline, recursive, package-unlock, or guaranteed-return reward model is part of the product.
- Reward payout review remains manual/admin-approved.
