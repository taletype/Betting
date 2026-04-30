create table if not exists public.external_market_cache (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'polymarket' check (source in ('polymarket')),
  external_id text not null,
  slug text not null,
  title text not null,
  description text,
  category text,
  outcomes jsonb not null default '[]'::jsonb,
  prices jsonb not null default '{}'::jsonb,
  best_bid numeric,
  best_ask numeric,
  volume numeric,
  liquidity numeric,
  close_time timestamptz,
  resolution_status text,
  polymarket_url text,
  raw_json jsonb not null default '{}'::jsonb,
  source_provenance jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz,
  stale_after timestamptz,
  is_active boolean not null default true,
  is_tradable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id),
  unique (slug)
);

create index if not exists external_market_cache_active_idx
  on public.external_market_cache (is_active, is_tradable, last_synced_at desc)
  where is_active = true;

create index if not exists external_market_cache_volume_desc_idx
  on public.external_market_cache (volume desc nulls last);

create index if not exists external_market_cache_close_time_idx
  on public.external_market_cache (close_time);

create index if not exists external_market_cache_source_external_id_idx
  on public.external_market_cache (source, external_id);

create index if not exists external_market_cache_slug_idx
  on public.external_market_cache (slug);

create table if not exists public.external_market_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'polymarket' check (source in ('polymarket')),
  sync_kind text not null default 'market_list',
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failure', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  markets_seen int not null default 0,
  markets_upserted int not null default 0,
  error_message text,
  diagnostics jsonb not null default '{}'::jsonb
);

create unique index if not exists external_market_sync_runs_one_running_idx
  on public.external_market_sync_runs (source, sync_kind)
  where status = 'running';

create index if not exists external_market_sync_runs_source_started_idx
  on public.external_market_sync_runs (source, started_at desc);

alter table public.external_orderbook_snapshots
  add column if not exists external_market_cache_id uuid references public.external_market_cache (id) on delete cascade,
  add column if not exists stale_after timestamptz;

create index if not exists external_orderbook_snapshots_cache_captured_idx
  on public.external_orderbook_snapshots (external_market_cache_id, captured_at desc)
  where external_market_cache_id is not null;

alter table public.external_market_cache enable row level security;
alter table public.external_orderbook_snapshots enable row level security;
alter table public.external_market_sync_runs enable row level security;

drop policy if exists "public can read external market cache" on public.external_market_cache;
create policy "public can read external market cache"
  on public.external_market_cache
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public can read external orderbook snapshots" on public.external_orderbook_snapshots;
create policy "public can read external orderbook snapshots"
  on public.external_orderbook_snapshots
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon cannot write external market cache" on public.external_market_cache;
drop policy if exists "authenticated cannot write external market cache" on public.external_market_cache;
drop policy if exists "public can read external market sync runs" on public.external_market_sync_runs;
