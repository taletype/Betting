create table if not exists public.markets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  status text not null check (status in ('draft', 'open', 'halted', 'resolved', 'cancelled')),
  collateral_currency text not null default 'USD',
  min_price bigint not null,
  max_price bigint not null,
  tick_size bigint not null,
  close_time timestamptz,
  resolve_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete cascade,
  slug text not null,
  title text not null,
  outcome_index integer not null,
  created_at timestamptz not null default now(),
  unique (market_id, slug),
  unique (market_id, outcome_index)
);

alter table public.markets enable row level security;
alter table public.outcomes enable row level security;
