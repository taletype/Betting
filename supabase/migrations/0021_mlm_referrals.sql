create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.referral_relationships (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.profiles (id) on delete cascade,
  sponsor_user_id uuid not null references public.profiles (id) on delete restrict,
  referral_code_id uuid references public.referral_codes (id) on delete set null,
  source text not null check (source in ('invite_code', 'admin_override')),
  assigned_by_user_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referred_user_id),
  check (referred_user_id <> sponsor_user_id)
);

create index if not exists referral_relationships_sponsor_user_id_idx
  on public.referral_relationships (sponsor_user_id, created_at desc);

create table if not exists public.referral_relationship_events (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.profiles (id) on delete cascade,
  sponsor_user_id uuid not null references public.profiles (id) on delete restrict,
  previous_sponsor_user_id uuid references public.profiles (id) on delete set null,
  referral_code_id uuid references public.referral_codes (id) on delete set null,
  action text not null check (action in ('assigned', 'overridden')),
  source text not null check (source in ('invite_code', 'admin_override')),
  actor_user_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (referred_user_id <> sponsor_user_id)
);

create index if not exists referral_relationship_events_referred_user_id_idx
  on public.referral_relationship_events (referred_user_id, created_at desc);

create table if not exists public.mlm_commission_plans (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  name text not null,
  payable_depth integer not null check (payable_depth > 0),
  is_active boolean not null default false,
  activated_at timestamptz,
  created_by_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_active = false) or (activated_at is not null))
);

create unique index if not exists mlm_commission_plans_single_active_idx
  on public.mlm_commission_plans ((is_active))
  where is_active = true;

create table if not exists public.mlm_commission_plan_levels (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.mlm_commission_plans (id) on delete cascade,
  level_depth integer not null check (level_depth > 0),
  rate_bps integer not null check (rate_bps >= 0 and rate_bps <= 10000),
  created_at timestamptz not null default now(),
  unique (plan_id, level_depth)
);

create index if not exists mlm_commission_plan_levels_plan_id_idx
  on public.mlm_commission_plan_levels (plan_id, level_depth asc);

create table if not exists public.mlm_commission_events (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references public.chain_deposits (id) on delete cascade,
  source_user_id uuid not null references public.profiles (id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles (id) on delete restrict,
  referral_relationship_id uuid references public.referral_relationships (id) on delete set null,
  plan_id uuid not null references public.mlm_commission_plans (id) on delete restrict,
  plan_level_id uuid not null references public.mlm_commission_plan_levels (id) on delete restrict,
  level_depth integer not null check (level_depth > 0),
  amount bigint not null check (amount >= 0),
  currency text not null,
  payout_status text not null check (payout_status in ('credited', 'skipped')),
  skip_reason text,
  journal_id uuid references public.ledger_journals (id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (deposit_id, beneficiary_user_id, level_depth),
  check (
    (payout_status = 'credited' and journal_id is not null and skip_reason is null)
    or (payout_status = 'skipped' and journal_id is null and skip_reason is not null)
  )
);

create index if not exists mlm_commission_events_beneficiary_user_id_idx
  on public.mlm_commission_events (beneficiary_user_id, created_at desc);

create index if not exists mlm_commission_events_source_user_id_idx
  on public.mlm_commission_events (source_user_id, created_at desc);

alter table public.referral_codes enable row level security;
alter table public.referral_relationships enable row level security;
alter table public.referral_relationship_events enable row level security;
alter table public.mlm_commission_plans enable row level security;
alter table public.mlm_commission_plan_levels enable row level security;
alter table public.mlm_commission_events enable row level security;

alter table public.ledger_journals
  drop constraint if exists ledger_journals_journal_kind_check;

alter table public.ledger_journals
  add constraint ledger_journals_journal_kind_check
  check (
    journal_kind in (
      'order_reserve',
      'order_release',
      'reserve',
      'release',
      'settle',
      'deposit',
      'deposit_confirmed',
      'withdrawal',
      'withdrawal_requested',
      'withdrawal_completed',
      'withdrawal_failed',
      'reconciliation_adjustment',
      'claim_payout',
      'mlm_commission'
    )
  );
