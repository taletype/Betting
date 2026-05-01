# Referral Hardening

Referral capture supports `/?ref=CODE`, `/polymarket?ref=CODE`, market detail links such as `/polymarket/[slug]?ref=CODE`, shared market links, and ambassador invite links.

Rules:
- First valid referral wins. A later code must not overwrite an existing valid attribution.
- Codes are normalized to uppercase and must match the referral code validator.
- Self-referral is rejected after the user identity is known.
- Disabled and malformed codes are rejected.
- Duplicate attribution attempts are idempotent and recorded for review.
- Referral apply failures must not block market browsing.

The browser stores a pending referral in localStorage and a SameSite cookie before login. After signup/login, the apply request includes an idempotency key and a non-secret session identifier. Client funnel events include `referral_code_seen` and `referral_code_captured`; server audit events record `ambassador.referral_seen`, `ambassador.referral_captured`, `ambassador.referral_applied`, and `ambassador.referral_rejected` without storing raw auth headers or secrets.

Operational dashboard requirements:
- Apply the Supabase migrations that create and extend `public.profiles`, `public.ambassador_codes`, `public.referral_attributions`, `public.builder_trade_attributions`, `public.ambassador_reward_ledger`, and `public.ambassador_reward_payouts`. Required coverage includes `supabase/migrations/0002_auth_profiles.sql`, `supabase/migrations/0021_ambassador_rewards.sql`, `supabase/migrations/0031_reward_ledger_accounting_statuses.sql`, `supabase/migrations/0034_reward_payout_reservations.sql`, and `supabase/migrations/0038_attribution_to_payout_accounting_chain.sql`.
- New Supabase users should receive a `profiles` row through `public.rpc_create_profile_for_auth_user()`. The dashboard also performs an idempotent profile fallback before creating a referral code, so historical auth users created before the trigger existed can still load the dashboard.
- If `API_BASE_URL` points to the service API, the web server must forward a Supabase Bearer token and the service API must have `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and database connection env (`SUPABASE_DB_URL` or `DATABASE_URL`). Service-role keys must stay server-only.
- Referral rewards are accounting records until admin review. Wallet payouts are never automatic.
