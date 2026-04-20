create table if not exists public.external_markets (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('polymarket', 'kalshi')),
  external_id text not null,
  market_id uuid references public.markets (id) on delete set null,
  sync_status text not null default 'pending',
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

alter table public.external_markets enable row level security;
