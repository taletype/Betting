# Ambassador Rewards for Hong Kong Review

This system is a direct-referral-only Ambassador Rewards scaffold for Builder-fee revenue accounting.

## Model

Ambassadors refer traders with an ambassador code. Referred traders create their own account, connect their own wallet or Polymarket credentials, and place their own user-signed trades through the non-custodial Polymarket routed UI when that feature is enabled.

Rewards are tied only to confirmed Builder-fee revenue observed from eligible routed trading activity.

## Prohibited Structures

The implementation does not include multi-level compensation, recursive referral payouts, generation-level commissions, binary or matrix placement, spillover logic, package purchases, pay-to-join requirements, or recruitment-only bonuses.

No payment, deposit, token, NFT, subscription, starter kit, or package unlock is required to become an ambassador.

## Reward Formula

Default shares:

- Platform revenue: 60%
- Direct referrer commission: 30%
- Trader cashback: 10%

If there is no direct referrer, the referrer share remains platform revenue. Reward shares must sum to 10,000 bps.

Reward types are limited to:

- `platform_revenue`
- `direct_referrer_commission`
- `trader_cashback`

## Accounting Boundary

Builder-fee events are recorded in `builder_trade_attributions`. Rewards are recorded in the separate `ambassador_reward_ledger`.

Reward accounting does not import or mutate the internal trading ledger, internal balances, deposits, withdrawals, positions, or order matching modules.

All rewards start as `pending`. Confirmed trade attributions can move rewards to `payable`. Payout still requires manual admin review.

## Abuse Controls

- Self-referral rejected
- One attribution per referred user
- Disabled codes rejected
- Final attribution requires verified Supabase Auth identity; pending `?ref=` capture before login is local/cookie state only
- Duplicate Polymarket order/trade IDs treated idempotently
- Non-positive notional or Builder fee rejected
- Rewards voided when a trade attribution is voided
- Suspicious same-wallet attribution review scaffolded
- No recursive traversal or second-level reward creation

## Non-Custodial Polymarket Boundary

External Polymarket trading remains user-owned and user-signed. The app attaches the configured Builder code only when routed trading is safely enabled. The app does not custody Polymarket funds and does not trade for users.

`POLYMARKET_ROUTED_TRADING_ENABLED` remains false by default.

## Legal Review

Legal review is required before launch in Hong Kong, before enabling live Polymarket routed trading, and before advertising reward claims publicly.

## Auth Boundary

Users can view only their own private reward records after Supabase login. Payout requests require verified user identity and wallet destination validation. Admin approval, paid, failed, cancelled, void, and manual adjustment actions require a verified Supabase admin and remain manual/auditable; no automatic treasury transfer is enabled.
