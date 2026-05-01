-- Full attribution-to-payout accounting chain hardening.
--
-- This migration is additive. It keeps the existing ambassador tables as the
-- operational source while adding canonical click/session, route event, revenue
-- ledger, wallet view, and audit metadata surfaces for operator review.

create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid references public.ambassador_codes (id) on delete set null,
  referrer_user_id uuid references public.profiles (id) on delete set null,
  raw_code text not null,
  landing_path text not null default '/',
  query_ref text,
  anonymous_session_id text,
  user_agent_hash text,
  ip_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'seen' check (status in ('seen', 'captured', 'rejected', 'applied')),
  reject_reason text,
  created_at timestamptz not null default now(),
  check ((status = 'rejected' and reject_reason is not null) or status <> 'rejected')
);

create index if not exists referral_clicks_code_seen_idx
  on public.referral_clicks (referral_code_id, first_seen_at desc)
  where referral_code_id is not null;

create index if not exists referral_clicks_session_idx
  on public.referral_clicks (anonymous_session_id, first_seen_at desc)
  where anonymous_session_id is not null;

create unique index if not exists referral_clicks_session_code_path_idx
  on public.referral_clicks (anonymous_session_id, (upper(raw_code)), landing_path)
  where anonymous_session_id is not null;

create table if not exists public.referral_sessions (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id text not null unique,
  first_referral_click_id uuid references public.referral_clicks (id) on delete set null,
  active_referral_click_id uuid references public.referral_clicks (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'expired', 'rejected')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  applied_user_id uuid references public.profiles (id) on delete set null,
  applied_at timestamptz
);

create table if not exists public.pending_referral_attributions (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id text not null,
  referral_click_id uuid references public.referral_clicks (id) on delete set null,
  raw_code text not null,
  normalized_code text,
  landing_path text not null default '/',
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'expired')),
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_user_id uuid references public.profiles (id) on delete set null,
  applied_referral_attribution_id uuid references public.referral_attributions (id) on delete set null,
  applied_at timestamptz,
  check ((status = 'rejected' and reject_reason is not null) or status <> 'rejected')
);

create index if not exists pending_referral_attributions_session_idx
  on public.pending_referral_attributions (anonymous_session_id, created_at desc);

create unique index if not exists pending_referral_attributions_open_session_idx
  on public.pending_referral_attributions (anonymous_session_id)
  where status = 'pending';

create table if not exists public.builder_route_events (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  idempotency_key text not null,
  event_type text not null check (
    event_type in (
      'routed_trade_attempted',
      'builder_attribution_prepared',
      'builder_attribution_submitted',
      'routed_order_signed',
      'routed_order_submitted',
      'routed_order_matched',
      'builder_fee_confirmed',
      'builder_fee_voided'
    )
  ),
  app_user_id uuid references public.profiles (id) on delete set null,
  wallet_address text,
  market_external_id text,
  external_order_id text,
  external_trade_id text,
  source text not null default 'polymarket',
  builder_code text,
  side text not null default 'unknown' check (side in ('maker', 'taker', 'unknown')),
  notional_amount_atoms bigint check (notional_amount_atoms is null or notional_amount_atoms >= 0),
  builder_fee_bps integer check (builder_fee_bps is null or (builder_fee_bps >= 0 and builder_fee_bps <= 10000)),
  builder_fee_amount_atoms bigint check (builder_fee_amount_atoms is null or builder_fee_amount_atoms >= 0),
  asset text,
  raw_reference_id text,
  occurred_at timestamptz,
  ingested_at timestamptz not null default now(),
  status text not null default 'ingested' check (status in ('ingested', 'eligible', 'ineligible', 'rejected', 'void')),
  ineligible_reason text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists builder_route_events_idempotency_idx
  on public.builder_route_events (idempotency_key);

create index if not exists builder_route_events_user_wallet_idx
  on public.builder_route_events (app_user_id, lower(wallet_address), occurred_at desc)
  where app_user_id is not null and wallet_address is not null;

alter table public.builder_trade_attributions
  add column if not exists builder_route_event_id uuid references public.builder_route_events (id) on delete set null,
  add column if not exists trader_wallet_address text,
  add column if not exists builder_code text,
  add column if not exists eligibility_status text not null default 'pending'
    check (eligibility_status in ('pending', 'eligible', 'ineligible', 'suspicious')),
  add column if not exists eligibility_reason text;

create index if not exists builder_trade_attributions_wallet_idx
  on public.builder_trade_attributions (lower(trader_wallet_address), observed_at desc)
  where trader_wallet_address is not null;

create table if not exists public.builder_fee_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  builder_trade_attribution_id uuid not null references public.builder_trade_attributions (id) on delete restrict,
  source text not null default 'polymarket',
  external_order_id text,
  external_trade_id text,
  app_user_id uuid references public.profiles (id) on delete set null,
  trader_wallet_address text,
  referrer_user_id uuid references public.profiles (id) on delete set null,
  referral_attribution_id uuid references public.referral_attributions (id) on delete set null,
  builder_code text not null,
  market_external_id text,
  side text not null default 'unknown' check (side in ('maker', 'taker', 'unknown')),
  notional_amount_atoms bigint not null default 0 check (notional_amount_atoms >= 0),
  builder_fee_bps integer check (builder_fee_bps is null or (builder_fee_bps >= 0 and builder_fee_bps <= 10000)),
  builder_fee_amount_atoms bigint not null check (builder_fee_amount_atoms > 0),
  asset text not null default 'pUSD',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'void')),
  confirmation_source text,
  confirmed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  idempotency_key text not null,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'confirmed' and confirmed_at is not null) or status <> 'confirmed'),
  check ((status = 'void' and voided_at is not null and void_reason is not null) or status <> 'void')
);

create unique index if not exists builder_fee_revenue_ledger_idempotency_idx
  on public.builder_fee_revenue_ledger (idempotency_key);

create unique index if not exists builder_fee_revenue_ledger_trade_idx
  on public.builder_fee_revenue_ledger (builder_trade_attribution_id)
  where status <> 'void';

alter table public.ambassador_reward_ledger
  add column if not exists builder_fee_revenue_ledger_id uuid references public.builder_fee_revenue_ledger (id) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists calculation_bps integer check (calculation_bps is null or (calculation_bps >= 0 and calculation_bps <= 10000)),
  add column if not exists chain_id integer not null default 137,
  add column if not exists asset text not null default 'pUSD';

create unique index if not exists ambassador_reward_ledger_idempotency_idx
  on public.ambassador_reward_ledger (idempotency_key)
  where idempotency_key is not null;

create or replace view public.user_wallets as
select
  linked.id,
  linked.user_id,
  linked.wallet_address,
  linked.chain,
  true as primary_wallet,
  linked.verified_at,
  linked.created_at,
  linked.updated_at
from public.linked_wallets linked;

create or replace view public.reward_ledger_entries as
select
  ledger.id,
  ledger.builder_fee_revenue_ledger_id,
  ledger.source_trade_attribution_id as builder_trade_attribution_id,
  ledger.recipient_user_id as beneficiary_user_id,
  case
    when ledger.reward_type = 'platform_revenue' then 'platform'
    when ledger.reward_type = 'direct_referrer_commission' then 'direct_referrer'
    when ledger.reward_type = 'trader_cashback' then 'trader_cashback'
    else ledger.reward_type
  end as beneficiary_type,
  trade.user_id as app_user_id,
  trade.direct_referrer_user_id as referrer_user_id,
  trade.user_id as trader_user_id,
  ledger.amount_usdc_atoms as amount,
  ledger.asset,
  ledger.chain_id,
  ledger.calculation_bps,
  ledger.status,
  ledger.reserved_by_payout_id as payout_request_id,
  ledger.idempotency_key,
  ledger.created_at,
  ledger.payable_at,
  ledger.approved_at,
  ledger.reserved_at,
  ledger.paid_at,
  ledger.voided_at,
  ledger.void_reason,
  ledger.recipient_user_id,
  ledger.source_trade_attribution_id,
  ledger.reward_type,
  ledger.amount_usdc_atoms
from public.ambassador_reward_ledger ledger
join public.builder_trade_attributions trade on trade.id = ledger.source_trade_attribution_id;

alter table public.admin_audit_log
  add column if not exists actor_admin_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists before_status text,
  add column if not exists after_status text,
  add column if not exists note text;

update public.admin_audit_log
   set actor_admin_user_id = coalesce(actor_admin_user_id, actor_user_id),
       target_type = coalesce(target_type, entity_type),
       target_id = coalesce(target_id, entity_id)
 where actor_admin_user_id is null
    or target_type is null
    or target_id is null;

alter table public.referral_clicks enable row level security;
alter table public.referral_sessions enable row level security;
alter table public.pending_referral_attributions enable row level security;
alter table public.builder_route_events enable row level security;
alter table public.builder_fee_revenue_ledger enable row level security;
