# Auth RLS Checklist

## Public Read-Only Tables

- External market cache tables: `external_markets`, `external_outcomes`, `external_trade_ticks`, `external_orderbook_snapshots`.
- Policies should allow anonymous/select-only access for public market fields, or serve them through server routes using a server-only client.

## User-Owned Tables

- `profiles`
- `linked_wallets`
- `orders`, `positions`, user portfolio/claim views
- `deposits`, `withdrawals`
- `referral_attributions` rows where `referred_user_id = auth.uid()` or referrer summary views scoped to `auth.uid()`
- `ambassador_reward_ledger` and `ambassador_reward_payouts` rows where `recipient_user_id = auth.uid()`

Recommended policy shape:

```sql
alter table public.profiles enable row level security;
create policy "profiles read own" on public.profiles for select using (id = auth.uid());
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
```

Apply equivalent `auth.uid()` ownership checks to user-owned tables. Mutations that require invariants should go through RPC functions that validate `auth.uid()` server-side.

## Admin-Only Tables

- Ambassador code management beyond own active code.
- Admin reward review and payout review actions.
- Market resolution/admin audit tables.
- Sensitive exports and reconciliation/private operational views.

Recommended policy shape:

```sql
create policy "admin read" on public.ambassador_reward_payouts
for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

Use the same admin claim check for admin-only write policies, or restrict writes to audited RPCs.

## Service-Role Usage

- Service-role keys are server-only.
- Service-role access may bypass RLS for background jobs, read-only public cache serving, or audited admin RPC orchestration.
- Service-role access must never be used as the user/admin identity shortcut for browser-originated commands.

## Migration Status

The repo already has RLS migrations, including `supabase/migrations/0012_rls_policies.sql`, but the policy comments indicate further tightening is needed. No broad policy rewrite was applied in this pass to avoid breaking production data access without a Supabase dashboard review.

Manual TODO:

- Verify every user-owned table has `auth.uid()` ownership policies.
- Verify admin policies use Supabase app metadata/admin claim or audited RPCs.
- Verify public market tables expose only non-sensitive fields.
- Confirm service-role use is limited to server code and jobs.
