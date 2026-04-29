alter table public.profiles
  add column if not exists email text,
  add column if not exists locale text not null default 'zh-HK';

create or replace function public.rpc_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, locale, created_at, updated_at)
  values (new.id, new.email, 'zh-HK', now(), now())
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        locale = coalesce(public.profiles.locale, 'zh-HK'),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.rpc_create_profile_for_auth_user();

create table if not exists public.ambassador_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  check ((status = 'disabled' and disabled_at is not null) or (status = 'active' and disabled_at is null))
);

create unique index if not exists ambassador_codes_owner_active_idx
  on public.ambassador_codes (owner_user_id)
  where status = 'active';

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.profiles (id) on delete cascade,
  referrer_user_id uuid not null references public.profiles (id) on delete restrict,
  ambassador_code text not null,
  attributed_at timestamptz not null default now(),
  qualification_status text not null default 'pending' check (qualification_status in ('pending', 'qualified', 'rejected')),
  rejection_reason text,
  unique (referred_user_id),
  check (referred_user_id <> referrer_user_id),
  check (
    (qualification_status = 'rejected' and rejection_reason is not null)
    or (qualification_status in ('pending', 'qualified'))
  )
);

create index if not exists referral_attributions_referrer_user_id_idx
  on public.referral_attributions (referrer_user_id, attributed_at desc);

create table if not exists public.builder_trade_attributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  direct_referrer_user_id uuid references public.profiles (id) on delete set null,
  polymarket_order_id text,
  polymarket_trade_id text,
  condition_id text,
  market_slug text,
  notional_usdc_atoms bigint not null check (notional_usdc_atoms > 0),
  builder_fee_usdc_atoms bigint not null check (builder_fee_usdc_atoms > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'void')),
  raw_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (direct_referrer_user_id is null or direct_referrer_user_id <> user_id),
  check ((status = 'confirmed' and confirmed_at is not null) or status <> 'confirmed')
);

create unique index if not exists builder_trade_attributions_polymarket_order_id_idx
  on public.builder_trade_attributions (polymarket_order_id)
  where polymarket_order_id is not null;

create unique index if not exists builder_trade_attributions_polymarket_trade_id_idx
  on public.builder_trade_attributions (polymarket_trade_id)
  where polymarket_trade_id is not null;

create index if not exists builder_trade_attributions_user_id_idx
  on public.builder_trade_attributions (user_id, observed_at desc);

create index if not exists builder_trade_attributions_referrer_idx
  on public.builder_trade_attributions (direct_referrer_user_id, observed_at desc)
  where direct_referrer_user_id is not null;

create table if not exists public.ambassador_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.profiles (id) on delete restrict,
  source_trade_attribution_id uuid not null references public.builder_trade_attributions (id) on delete cascade,
  reward_type text not null check (
    reward_type in (
      'platform_revenue',
      'direct_referrer_commission',
      'trader_cashback'
    )
  ),
  amount_usdc_atoms bigint not null check (amount_usdc_atoms >= 0),
  status text not null default 'pending' check (status in ('pending', 'payable', 'approved', 'paid', 'void')),
  created_at timestamptz not null default now(),
  payable_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  check (
    (reward_type = 'platform_revenue' and recipient_user_id is null)
    or (reward_type <> 'platform_revenue' and recipient_user_id is not null)
  )
);

create unique index if not exists ambassador_reward_ledger_source_type_recipient_idx
  on public.ambassador_reward_ledger (
    source_trade_attribution_id,
    reward_type,
    coalesce(recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists ambassador_reward_ledger_recipient_status_idx
  on public.ambassador_reward_ledger (recipient_user_id, status, created_at desc)
  where recipient_user_id is not null;

create table if not exists public.ambassador_reward_payouts (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (id) on delete restrict,
  amount_usdc_atoms bigint not null check (amount_usdc_atoms > 0),
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'failed', 'cancelled')),
  destination_type text not null check (destination_type in ('wallet', 'manual')),
  destination_value text not null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  tx_hash text,
  notes text,
  created_at timestamptz not null default now(),
  check ((status in ('approved', 'paid', 'failed', 'cancelled') and reviewed_at is not null) or status = 'requested'),
  check ((status = 'paid' and paid_at is not null) or status <> 'paid')
);

create index if not exists ambassador_reward_payouts_recipient_status_idx
  on public.ambassador_reward_payouts (recipient_user_id, status, created_at desc);

alter table public.ambassador_codes enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.builder_trade_attributions enable row level security;
alter table public.ambassador_reward_ledger enable row level security;
alter table public.ambassador_reward_payouts enable row level security;
