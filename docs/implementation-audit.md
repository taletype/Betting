# Implementation Audit

Last updated: 2026-05-01

## Immediate Next Moves

Simple answer: the remaining work is production proof and money-flow hardening, not more SDK integration.

Missing work now:

- Missing #1: `/ambassador` and `/rewards` must work cleanly in production, including a logged-in dashboard response where referral code loads and zero rewards still render as a valid empty state.
- Missing #2: referral and payout hardening must be treated as one scoped PR focused on referral capture, first-valid-referral-wins behavior, fraud flags, reward-ledger idempotency, payout status transitions, admin approval, Polygon transaction hash recording, and no auto payout.
- Missing #3: Builder-fee confirmation and reconciliation proof must be shown before rewards move from accounting evidence to payable money.
- Missing #4: private beta QA is still needed for wallet connection, L2 credentials, order signing, submitter readiness, caps, and kill-switch behavior.
- Missing #5: user guides and disclosures still need to be ready before public traffic.

Build order now:

1. Make `/ambassador` and `/rewards` clean in production.
2. Harden referral capture and payout handling.
3. Prove Builder-fee revenue to reward-ledger reconciliation.
4. Run a private allowlisted trading beta.
5. Only then consider public live trading.

## Current Routes

- Public portal: `/`, `/polymarket`, `/polymarket/[slug]`, `/ambassador`, `/rewards`, `/guides/*`, `/login`, `/signup`, `/account`.
- Public market APIs: `/api/external/markets`, `/api/external/markets/[source]/[externalId]`, plus `orderbook`, `trades`, `history`, and `stats` subroutes. Legacy compatibility routes also exist at `/external/markets`.
- Routed trading shell APIs: `/api/polymarket/orders/preview`, `/api/polymarket/orders/preflight`, `/api/polymarket/orders/submit`. The same-site submit route returns disabled/unavailable by default.
- Admin pages: `/admin`, `/admin/ambassadors`, `/admin/rewards`, `/admin/payouts`, `/admin/polymarket`.
- Admin APIs: `/api/admin/polymarket/status`, `/api/admin/ambassador/*`, and `/api/admin/launch/status`.

## Current Market Data Path

- Public browsing is read-only and served from Supabase-backed cache tables, not from frontend Polymarket calls.
- The external sync worker uses public Polymarket Gamma/CLOB APIs through `@bet/integrations`, normalizes market status, and writes `external_markets`, `external_outcomes`, trade ticks, orderbook snapshots, and the public `external_market_cache`.
- `/api/external/markets` defaults to `status=open` and supports `status=open`, `status=closed`, `status=resolved`, `status=cancelled`, and `status=all`.
- Status is normalized from explicit upstream status/resolution flags plus `closed`, `active`, `resolved_at`, `closeTime`, `closedTime`, `endDate`, and `end_date_iso`; past close/end time is closed.
- `/polymarket` and home trending exclude closed, resolved, cancelled, stale, zero-activity, and no-price rows from active/trending defaults. If stale rows are present, the UI shows: `市場資料可能已過期，請稍後再試。`

## Current Referral Data Path

- `?ref=CODE` is normalized in `apps/web/src/lib/referral-capture.ts`.
- `ReferralCapture` persists the first valid pending code into localStorage and a SameSite cookie before login.
- Pending referral banners render on `/`, `/polymarket`, `/polymarket/[slug]`, `/ambassador`, and `/rewards`.
- Applying a referral after login uses `/api/ambassador/capture`, which is idempotent because `referral_attributions.referred_user_id` is unique.
- Disabled codes, invalid codes, and self-referrals are rejected. No recursive or second-level referral attribution exists.

## Reward And Payout Tables

- Existing physical tables: `ambassador_codes`, `referral_attributions`, `builder_trade_attributions`, `ambassador_reward_ledger`, `ambassador_reward_payouts`, `ambassador_risk_flags`, and `admin_audit_log`.
- Canonical compatibility views: `reward_ledger_entries` and `payout_requests`.
- Reward ledger statuses are accounting-only: `pending`, `payable`, `paid`, `void`.
- Payout statuses are workflow states: `requested`, `approved`, `paid`, `failed`, `cancelled`.
- Reward split defaults are platform 60%, direct referrer 30%, trader cashback 10%; if there is no valid direct referrer, the referrer share remains platform revenue.
- Payouts use Polygon chain id `137` and `pUSD`; wallet destinations and paid tx hashes are validated as EVM `0x` values.

## Trading Readiness Logic

- `POLYMARKET_ROUTED_TRADING_ENABLED` defaults to false and is server-only.
- `POLY_BUILDER_CODE` is server-only and optional for browsing. Missing builder code must not break public market browsing.
- The public trade ticket is a gated shell. It remains disabled unless feature flag, server-confirmed Builder Code, user login, wallet connection, user-owned Polymarket credentials, user-signing availability, tradable market, order validity, and submitter readiness all pass.
- Public UI now reports `交易功能尚未啟用` unless the safe routed path is fully ready. It never exposes the actual Builder Code.
- Same-site `/api/polymarket/orders/submit` does not submit orders and returns `POLYMARKET_SUBMITTER_UNAVAILABLE`.

## Legacy Areas To Quarantine

- Internal `/api/orders`, `/api/withdrawals`, `/api/deposits/verify`, and old portfolio/balance routes still exist for legacy app surfaces. They must not be linked from public Polymarket pages or used to represent Polymarket activity.
- Generic betting exchange, Sepolia, custodial-balance, and automatic payout language should stay out of public Polymarket pages.
- Admin Builder attribution placeholders are operator-only, remain unconfirmed, and should stay behind real Supabase admin authorization.
