# Ambassador Dashboard Production Health

The logged-in ambassador, account, and rewards pages depend on the same dashboard path. In production the dashboard should return a valid empty payload for new users; missing data is not an error.

Required environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` or `SUPABASE_DB_URL`
- `NEXT_PUBLIC_SITE_URL`

Required tables:

- `public.profiles`
- `public.ambassador_codes`
- `public.referral_attributions`
- `public.builder_trade_attributions`
- `public.ambassador_reward_ledger`
- `public.ambassador_reward_payouts`
- `public.linked_wallets`
- `public.wallet_link_challenges`

Apply these migrations when tables are missing:

- `supabase/migrations/0002_auth_profiles.sql`
- `supabase/migrations/0021_ambassador_rewards.sql`
- `supabase/migrations/0025_wallet_link_challenges.sql`
- `supabase/migrations/0031_reward_ledger_accounting_statuses.sql`
- `supabase/migrations/0034_reward_payout_reservations.sql`
- `supabase/migrations/0037_polymarket_builder_fee_reconciliation.sql`
- `supabase/migrations/0038_attribution_to_payout_accounting_chain.sql`

Admin-only check:

- `GET /api/admin/ambassador-dashboard-health`

Safe failure codes and operator action:

- `ambassador_tables_missing`: apply the required production Supabase migrations listed above.
- `profile_write_failed`: check service-role configuration, RLS policies, and the `public.profiles` insert/upsert path.
- `dashboard_db_unavailable`: check `DATABASE_URL` or `SUPABASE_DB_URL`.
- `service_api_unreachable`: check that `API_BASE_URL` points to a reachable service API.
- `service_api_401`: check service API authentication configuration between the web app and service API.
- `service_api_500`: check service API logs for the failing dashboard request.
- `ambassador_code_create_failed`: check `public.ambassador_codes` constraints and collision/retry behavior.

The health response must not include cookies, bearer tokens, service-role keys, SQL connection strings, private keys, L2 secrets, or signatures.
