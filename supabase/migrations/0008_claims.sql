create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete restrict,
  resolution_id uuid,
  claimable_amount bigint not null default 0,
  claimed_amount bigint not null default 0,
  status text not null check (status in ('pending', 'claimable', 'claimed', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.claims enable row level security;
