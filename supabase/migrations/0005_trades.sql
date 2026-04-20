create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete restrict,
  outcome_id uuid not null references public.outcomes (id) on delete restrict,
  maker_order_id uuid not null references public.orders (id) on delete restrict,
  taker_order_id uuid not null references public.orders (id) on delete restrict,
  maker_user_id uuid not null references public.profiles (id) on delete restrict,
  taker_user_id uuid not null references public.profiles (id) on delete restrict,
  price bigint not null,
  quantity bigint not null,
  notional bigint not null,
  sequence bigint not null,
  matched_at timestamptz not null default now(),
  unique (market_id, sequence)
);

alter table public.trades enable row level security;
