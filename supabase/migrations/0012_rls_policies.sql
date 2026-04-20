create policy "profiles_self_select"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_self_update"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "markets_public_read"
on public.markets
for select
to anon, authenticated
using (true);

create policy "outcomes_public_read"
on public.outcomes
for select
to anon, authenticated
using (true);

create policy "orders_user_read"
on public.orders
for select
to authenticated
using (auth.uid() = user_id);

create policy "positions_user_read"
on public.positions
for select
to authenticated
using (auth.uid() = user_id);

create policy "claims_user_read"
on public.claims
for select
to authenticated
using (auth.uid() = user_id);

create policy "trades_public_read"
on public.trades
for select
to anon, authenticated
using (true);

create policy "resolution_public_read"
on public.resolutions
for select
to anon, authenticated
using (true);

create policy "external_markets_internal_read"
on public.external_markets
for select
to authenticated
using (true);

create policy "audit_logs_admin_placeholder"
on public.audit_logs
for select
to authenticated
using (false);

create policy "ledger_journals_internal_placeholder"
on public.ledger_journals
for select
to authenticated
using (false);

create policy "ledger_entries_internal_placeholder"
on public.ledger_entries
for select
to authenticated
using (false);

-- TODO: tighten all authenticated/internal policies once service-role and admin role boundaries are finalized.
-- TODO: add insert/update/delete policies for write paths after auth model and RPC surface are finalized.
