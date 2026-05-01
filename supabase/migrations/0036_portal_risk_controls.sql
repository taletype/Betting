-- Portal risk controls for referral attribution, reward state transitions, payouts, and auditability.

alter table public.referral_attributions
  add column if not exists landing_session_hash text,
  add column if not exists ip_hash text,
  add column if not exists user_agent_hash text,
  add column if not exists idempotency_key text,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists attribution_policy text not null default 'first_valid_code_wins';

create index if not exists referral_attributions_session_hash_idx
  on public.referral_attributions (landing_session_hash, attributed_at desc)
  where landing_session_hash is not null;

create index if not exists referral_attributions_first_seen_idx
  on public.referral_attributions (first_seen_at desc);

alter table public.builder_trade_attributions
  add column if not exists referral_attribution_id uuid references public.referral_attributions (id) on delete set null;

create index if not exists builder_trade_attributions_referral_attribution_idx
  on public.builder_trade_attributions (referral_attribution_id)
  where referral_attribution_id is not null;

-- Rewards can only become payable/approved/paid after the source Builder-fee
-- attribution has been confirmed.
create or replace function public.rpc_guard_reward_ledger_confirmed_source()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_status text;
begin
  if new.status in ('payable', 'approved', 'paid') then
    select status
      into source_status
      from public.builder_trade_attributions
     where id = new.source_trade_attribution_id
     limit 1;

    if source_status is distinct from 'confirmed' then
      raise exception 'builder trade attribution must be confirmed before rewards become %', new.status
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_reward_ledger_confirmed_source on public.ambassador_reward_ledger;
create trigger guard_reward_ledger_confirmed_source
before insert or update of status, source_trade_attribution_id on public.ambassador_reward_ledger
for each row
execute function public.rpc_guard_reward_ledger_confirmed_source();

-- Payout requests cannot exceed the currently payable/reserved reward balance.
create or replace function public.rpc_guard_reward_payout_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  available_amount bigint;
begin
  if new.status in ('requested', 'approved') then
    select coalesce(sum(amount_usdc_atoms), 0::bigint)
      into available_amount
      from public.ambassador_reward_ledger
     where recipient_user_id = new.recipient_user_id
       and status in ('payable', 'approved')
       and (
         reserved_by_payout_id is null
         or reserved_by_payout_id = new.id
       );

    if new.amount_usdc_atoms > available_amount then
      raise exception 'payout amount exceeds payable reward balance'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_reward_payout_amount on public.ambassador_reward_payouts;
create trigger guard_reward_payout_amount
before insert or update of amount_usdc_atoms, status on public.ambassador_reward_payouts
for each row
execute function public.rpc_guard_reward_payout_amount();

-- Keep payout status changes monotonic and manual.
create or replace function public.rpc_guard_reward_payout_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('requested', 'approved') then
      raise exception 'new payout requests must start as requested or approved'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'approved' and old.status <> 'requested' then
    raise exception 'payout approval requires requested status'
      using errcode = '23514';
  end if;

  if new.status = 'paid' and old.status <> 'approved' then
    raise exception 'payout requires admin approval before it can be marked paid'
      using errcode = '23514';
  end if;

  if new.status in ('failed', 'cancelled') and old.status not in ('requested', 'approved') then
    raise exception 'only requested or approved payouts can be closed as failed/cancelled'
      using errcode = '23514';
  end if;

  if old.status in ('paid', 'failed', 'cancelled') then
    raise exception 'closed payout status cannot be changed'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_reward_payout_status_transition on public.ambassador_reward_payouts;
create trigger guard_reward_payout_status_transition
before insert or update of status on public.ambassador_reward_payouts
for each row
execute function public.rpc_guard_reward_payout_status_transition();
