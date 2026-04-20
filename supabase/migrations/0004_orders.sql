create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete restrict,
  outcome_id uuid not null references public.outcomes (id) on delete restrict,
  side text not null check (side in ('buy', 'sell')),
  order_type text not null check (order_type in ('limit', 'market')),
  status text not null check (status in ('pending', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected')),
  price bigint not null,
  quantity bigint not null,
  remaining_quantity bigint not null,
  reserved_amount bigint not null default 0,
  client_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_order_id)
);

alter table public.orders enable row level security;
