alter table public.external_markets
  add column if not exists raw_json jsonb not null default '{}'::jsonb,
  add column if not exists source_provenance jsonb not null default '{}'::jsonb,
  add column if not exists last_seen_at timestamptz;

alter table public.external_outcomes
  add column if not exists raw_json jsonb not null default '{}'::jsonb,
  add column if not exists source_provenance jsonb not null default '{}'::jsonb,
  add column if not exists last_seen_at timestamptz;

alter table public.external_trade_ticks
  add column if not exists source_provenance jsonb not null default '{}'::jsonb,
  add column if not exists last_seen_at timestamptz;

create table if not exists public.external_orderbook_snapshots (
  id uuid primary key default gen_random_uuid(),
  external_market_id uuid not null references public.external_markets (id) on delete cascade,
  external_outcome_id text not null,
  source text not null check (source in ('polymarket', 'kalshi')),
  bids_json jsonb not null default '[]'::jsonb,
  asks_json jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null,
  last_trade_price numeric,
  best_bid numeric,
  best_ask numeric,
  raw_json jsonb not null default '{}'::jsonb,
  source_provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists external_orderbook_snapshots_market_outcome_captured_idx
  on public.external_orderbook_snapshots (external_market_id, external_outcome_id, captured_at desc);

create table if not exists public.external_resolution_updates (
  id uuid primary key default gen_random_uuid(),
  external_market_id uuid not null references public.external_markets (id) on delete cascade,
  source text not null check (source in ('polymarket', 'kalshi')),
  external_resolution_id text not null,
  status text not null,
  resolved_outcome_external_id text,
  resolved_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  source_provenance jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_market_id, external_resolution_id)
);

alter table public.external_orderbook_snapshots enable row level security;
alter table public.external_resolution_updates enable row level security;
