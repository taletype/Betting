# MVP Scope

This launch MVP is a zh-HK-first Polymarket market portal with referral capture, safe public market browsing, a disabled/gated non-custodial trading shell, reward accounting visibility, and manual/admin-approved payouts.

## Route Surface

Public:

- `/`
- `/polymarket`
- `/polymarket/[slug]`
- `/guides`
- `/guides/how-polymarket-routing-works`
- `/guides/invite-rewards`
- `/guides/fees-and-builder-code`
- `/guides/polygon-pusd-payouts`

User:

- `/login`
- `/signup`
- `/account`
- `/ambassador`
- `/rewards`

Admin:

- `/admin`
- `/admin/ambassadors`
- `/admin/rewards`
- `/admin/payouts`
- `/admin/polymarket`

Legacy public product pages for Sepolia, generic exchange flows, internal market creation, faucet/collateral, and platform-custody-style balance UX are outside this MVP route set.

## Boundaries

- Public market browsing works without login.
- Referral capture works from `/?ref=CODE`, `/polymarket?ref=CODE`, and `/polymarket/[slug]?ref=CODE`.
- The app does not scrape Polymarket; it uses existing external market tables and official/public Polymarket APIs.
- Routed trading is non-custodial and must remain disabled by default.
- `POLYMARKET_ROUTED_TRADING_ENABLED=false` is the launch default.
- Users must sign their own orders if trading is enabled later.
- The app does not custody Polymarket funds, trade for users, pool funds, or use platform-owned credentials to place user trades.
- External Polymarket activity must not mutate internal balances.
- Rewards come from confirmed Builder-fee revenue only.
- Reward payouts require manual/admin approval and a recorded Polygon transaction hash.
- Automatic payouts are disabled.
- Rewards are direct-referral only; no MLM/downline/recursive rewards are part of this MVP.
