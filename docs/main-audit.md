# Main Launch-Safety Audit

Main is launchable only as a read-only, zh-HK-first Polymarket market portal with referral/reward accounting surfaces. Live routed trading is not enabled by default and must stay off until a separate production readiness review explicitly approves every user-owned signing, L2 credential, geoblock, submitter, and audit gate.

Current status:
- Public browsing works without login on `/`, `/polymarket`, and `/polymarket/[slug]`.
- Public market browsing does not require `POLY_BUILDER_CODE`.
- `POLYMARKET_ROUTED_TRADING_ENABLED` defaults to `false`.
- `POLYMARKET_CLOB_SUBMITTER` defaults to `disabled`.
- `@polymarket/clob-client-v2` is installed for the eventual authenticated CLOB V2 path.
- The deprecated `@polymarket/builder-signing-sdk` path is not used for CLOB V2 attribution.
- Builder attribution is represented by `POLY_BUILDER_CODE` in `orderInput.builderCode` before user signing and the signed order `builder` field.
- No platform-owned Polymarket credentials may be used for user orders.

Referral and rewards:
- First valid referral wins and later codes do not overwrite it.
- Self-referral, disabled codes, malformed codes, and duplicate applications are rejected or made idempotent with audit records.
- Rewards are direct-referral only.
- Rewards are created only from confirmed Builder-fee revenue.
- The split is platform 60%, direct referrer 30%, trader cashback 10%.
- If no valid direct referrer exists, the 30% referrer share remains platform revenue.
- Rewards are accounting records, not trading balances.

Payout and admin safety:
- Payouts use Polygon mainnet, chain `137`, asset `pUSD`, 6 decimals.
- Payouts are requested by users from payable rewards, then manually approved by admins.
- Approval does not pay. Paid status requires admin action and a valid Polygon transaction hash.
- No automatic treasury transfer exists, and `AMBASSADOR_AUTO_PAYOUT_ENABLED=true` is rejected.
- Admin endpoints must use authenticated Supabase admin authorization and must not trust spoofable `x-admin`, `x-user`, or role headers.
- Service-role keys stay server-side and must not appear in frontend source or build output.
- Admin actions write `admin_audit_log` with actor, target, action, timestamp, and status changes where applicable.

Out of scope for launch:
- No custody.
- No platform trading.
- No scraping.
- No recursive, second-level, tree, or multi-level rewards.
- No guaranteed-profit or managed-betting claims.
- No automatic payout.
