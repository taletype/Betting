alter table public.external_markets
  add column if not exists slug text not null default '',
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists status text not null default 'open',
  add column if not exists market_url text,
  add column if not exists close_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists best_bid numeric,
  add column if not exists best_ask numeric,
  add column if not exists last_trade_price numeric,
  add column if not exists volume_24h numeric,
  add column if not exists volume_total numeric;

create table if not exists public.external_outcomes (
  id uuid primary key default gen_random_uuid(),
  external_market_id uuid not null references public.external_markets (id) on delete cascade,
  external_outcome_id text not null,
  title text not null,
  slug text not null,
  outcome_index int not null,
  yes_no text check (yes_no in ('yes', 'no')),
  best_bid numeric,
  best_ask numeric,
  last_price numeric,
  volume numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_market_id, external_outcome_id)
);

create table if not exists public.external_trade_ticks (
  id uuid primary key default gen_random_uuid(),
  external_market_id uuid not null references public.external_markets (id) on delete cascade,
  external_trade_id text not null,
  external_outcome_id text,
  side text check (side in ('buy', 'sell')),
  price numeric not null,
  size numeric,
  traded_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (external_market_id, external_trade_id)
);

create table if not exists public.external_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('polymarket', 'kalshi')),
  checkpoint_key text not null,
  checkpoint_value jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, checkpoint_key)
);

create index if not exists external_outcomes_market_idx
  on public.external_outcomes (external_market_id);

create index if not exists external_trade_ticks_market_traded_at_idx
  on public.external_trade_ticks (external_market_id, traded_at desc);

create index if not exists external_sync_checkpoints_source_idx
  on public.external_sync_checkpoints (source, synced_at desc);

alter table public.external_outcomes enable row level security;
alter table public.external_trade_ticks enable row level security;
alter table public.external_sync_checkpoints enable row level security;
