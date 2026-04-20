create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete restrict,
  outcome_id uuid not null references public.outcomes (id) on delete restrict,
  net_quantity bigint not null default 0,
  average_entry_price bigint not null default 0,
  realized_pnl bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, market_id, outcome_id)
);

alter table public.positions enable row level security;
