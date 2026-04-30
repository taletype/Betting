-- Reward payout reservations
--
-- The application reserves payable user reward rows by moving them from
-- `payable` to `approved` when an open payout request is created/approved.
-- This migration keeps that existing status-based behavior but makes the
-- reservation explicit, auditable, and reversible for failed/cancelled payouts.

alter table public.ambassador_reward_ledger
  drop constraint if exists ambassador_reward_ledger_status_check;

alter table public.ambassador_reward_ledger
  add constraint ambassador_reward_ledger_status_check
  check (status in ('pending', 'payable', 'approved', 'paid', 'void'));

alter table public.ambassador_reward_ledger
  add column if not exists reserved_by_payout_id uuid,
  add column if not exists reserved_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ambassador_reward_ledger_reserved_payout_fk'
       and conrelid = 'public.ambassador_reward_ledger'::regclass
  ) then
    alter table public.ambassador_reward_ledger
      add constraint ambassador_reward_ledger_reserved_payout_fk
      foreign key (reserved_by_payout_id)
      references public.ambassador_reward_payouts (id)
      on delete set null
      not valid;
  end if;
end $$;

alter table public.ambassador_reward_ledger
  validate constraint ambassador_reward_ledger_reserved_payout_fk;

-- Backfill the explicit reservation timestamp for rows that were already
-- reserved through the status-only model before this migration.
update public.ambassador_reward_ledger
   set reserved_at = coalesce(reserved_at, approved_at, now()),
       approved_at = coalesce(approved_at, reserved_at, now())
 where status = 'approved'
   and reserved_at is null;

create or replace function public.rpc_apply_reward_payout_reservation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    new.reserved_at = coalesce(new.reserved_at, new.approved_at, now());
    new.approved_at = coalesce(new.approved_at, new.reserved_at, now());

    if new.recipient_user_id is not null then
      new.reserved_by_payout_id = coalesce(
        new.reserved_by_payout_id,
        (
          select payout.id
            from public.ambassador_reward_payouts payout
           where payout.recipient_user_id = new.recipient_user_id
             and payout.status in ('requested', 'approved')
           order by payout.created_at desc
           limit 1
        )
      );
    end if;
  end if;

  if new.status in ('pending', 'payable', 'void') then
    new.reserved_by_payout_id = null;
    new.reserved_at = null;

    if new.status = 'payable' then
      new.approved_at = null;
    end if;
  end if;

  if new.status = 'paid' then
    new.paid_at = coalesce(new.paid_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists apply_reward_payout_reservation on public.ambassador_reward_ledger;
create trigger apply_reward_payout_reservation
before update of status on public.ambassador_reward_ledger
for each row
execute function public.rpc_apply_reward_payout_reservation();

create or replace function public.rpc_close_reward_payout_reservation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('failed', 'cancelled')
     and old.status in ('requested', 'approved') then
    update public.ambassador_reward_ledger
       set status = 'payable',
           reserved_by_payout_id = null,
           reserved_at = null,
           approved_at = null
     where reserved_by_payout_id = new.id
       and status = 'approved';
  end if;

  if new.status = 'paid'
     and old.status = 'approved' then
    update public.ambassador_reward_ledger
       set status = 'paid',
           paid_at = coalesce(new.paid_at, now())
     where reserved_by_payout_id = new.id
       and status = 'approved';
  end if;

  return new;
end;
$$;

drop trigger if exists close_reward_payout_reservation on public.ambassador_reward_payouts;
create trigger close_reward_payout_reservation
after update of status on public.ambassador_reward_payouts
for each row
execute function public.rpc_close_reward_payout_reservation();

create index if not exists ambassador_reward_ledger_recipient_approved_idx
  on public.ambassador_reward_ledger (recipient_user_id, approved_at desc)
  where status = 'approved';

create index if not exists ambassador_reward_ledger_reserved_payout_idx
  on public.ambassador_reward_ledger (reserved_by_payout_id, recipient_user_id)
  where reserved_by_payout_id is not null;

create index if not exists ambassador_reward_ledger_recipient_reserved_idx
  on public.ambassador_reward_ledger (recipient_user_id, reserved_at desc)
  where status = 'approved';

-- Keep existing canonical reward reads working while appending the reservation
-- metadata needed by operators/admin smoke checks.
create or replace view public.reward_ledger_entries as
select
  id,
  recipient_user_id,
  source_trade_attribution_id,
  reward_type,
  amount_usdc_atoms,
  status,
  created_at,
  payable_at,
  paid_at,
  voided_at,
  void_reason,
  approved_at,
  reserved_by_payout_id,
  reserved_at
from public.ambassador_reward_ledger;
